import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
// Subpath of the direct `@medusajs/medusa` dep, matching seed.ts. Importing
// "@medusajs/core-flows" directly resolves in the IDE but throws at runtime —
// pnpm strict mode hides transitive deps from the consumer's node_modules.
} from "@medusajs/medusa/core-flows"

import {
  PRODUCTION_STAGE_EVENT,
  type ProductionStageChangedEvent,
} from "../lib/production-stage"

/**
 * Bridges the SC Prints production tracker to Medusa's own fulfilment
 * state, so staff touch ONE dropdown instead of two systems.
 *
 * Before this existed, nothing in the codebase ever created a Medusa
 * fulfillment — orders sat on "Not fulfilled" forever no matter how far
 * the production stage advanced, and the ORDER_SHIPPED email (which
 * production-stage.ts deliberately delegates to `shipment.created`,
 * see DOWNSTREAM_STAGES_THAT_EMAIL) could never fire.
 *
 * `location_id` is resolved from the order's own reservations rather
 * than left to Medusa's default. That default is "the location behind
 * the shipping option the customer picked" — always Australian
 * Warehouse, which holds 5 inventory levels. The real stock (and the
 * reservations) live at the supplier warehouses: AS Colour 7272,
 * FashionBiz 11008, Aussie Pacific 8279. Fulfilling against the default
 * throws "Inventory level for item … and location … not found".
 *
 * Sharing one fulfillment set across those locations is not an option —
 * Medusa's link layer enforces one set per location and rejects the
 * write with "Cannot create multiple links between 'stock_location' and
 * 'fulfillment'". Passing location_id explicitly sidesteps the admin
 * modal's location/shipping-option coupling entirely.
 *
 * Env:
 *   FULFILLMENT_BRIDGE_ENABLED=false  disable (default: on)
 *   FULFILLMENT_BRIDGE_NOTIFY=true    let it email customers
 *                                     (default: OFF — the shipped email
 *                                     has never fired historically, so
 *                                     enabling it while back-filling old
 *                                     orders would spam people about
 *                                     parcels they received weeks ago)
 */
const ENABLED = process.env.FULFILLMENT_BRIDGE_ENABLED !== "false"
const NOTIFY = process.env.FULFILLMENT_BRIDGE_NOTIFY === "true"

type FulfillableItem = { id: string; quantity: number }

export default async function orderStageSyncFulfillmentHandler({
  event: { data },
  container,
}: SubscriberArgs<ProductionStageChangedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const tag = "stage→fulfilment"

  if (!ENABLED) return
  const stage = data?.to_stage
  if (stage !== "shipped" && stage !== "delivered") return
  if (!data?.order_id) return

  const orderModule = container.resolve(Modules.ORDER) as any
  const inventoryModule = container.resolve(Modules.INVENTORY) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  let order: any
  try {
    // Items only. Fulfillments are a module link, not an ORM relation —
    // asking retrieveOrder for them throws "Entity 'Order' does not have
    // property 'fulfillments'". They come from the graph instead.
    order = await orderModule.retrieveOrder(data.order_id, {
      relations: ["items"],
    })
  } catch (err: any) {
    logger.warn(
      `${tag}: could not retrieve order ${data.order_id}: ${err?.message ?? err}`
    )
    return
  }

  const items: any[] = order?.items ?? []

  // ------------------------------------------------------ 1. fulfil
  const outstanding: FulfillableItem[] = items
    .map((i) => {
      const fulfilled = toNum(i?.detail?.fulfilled_quantity)
      const qty = toNum(i?.quantity) - fulfilled
      return qty > 0 ? { id: i.id as string, quantity: qty } : null
    })
    .filter((i): i is FulfillableItem => i !== null)

  if (outstanding.length > 0) {
    const locationId = await resolveLocationId(
      inventoryModule,
      query,
      items,
      logger,
      tag
    )
    try {
      await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: order.id,
          items: outstanding,
          location_id: locationId,
          no_notification: !NOTIFY,
        },
      })
      logger.info(
        `${tag}: fulfilled ${outstanding.length} item(s) on order ${order.id}` +
          ` at ${locationId ?? "default location"} (stage → ${stage}).`
      )
    } catch (err: any) {
      // Never rethrow: a failed bridge must not take down the stage
      // change itself, which staff have already committed to.
      logger.error(
        `${tag}: fulfilment failed for order ${order.id} (stage → ${stage}): ${
          err?.message ?? err
        }`
      )
      return
    }
  }

  // Read after creating, so we pick up whatever we just made.
  let fulfillments: any[] = []
  try {
    fulfillments = await loadFulfillments(query, order.id)
  } catch (err: any) {
    logger.warn(`${tag}: fulfillment lookup failed: ${err?.message ?? err}`)
    return
  }

  if (!fulfillments.length) {
    logger.warn(`${tag}: order ${order.id} has no fulfillment to advance.`)
    return
  }

  // --------------------------------------------- 2. ship / deliver
  for (const f of fulfillments) {
    const shipItems: FulfillableItem[] = (f?.items ?? []).map((fi: any) => ({
      id: fi.line_item_id ?? fi.id,
      quantity: toNum(fi.quantity, 1),
    }))

    if (stage === "shipped" && !f.shipped_at) {
      try {
        await createOrderShipmentWorkflow(container).run({
          input: {
            order_id: order.id,
            fulfillment_id: f.id,
            items: shipItems,
            no_notification: !NOTIFY,
          },
        })
        logger.info(`${tag}: marked fulfillment ${f.id} shipped.`)
      } catch (err: any) {
        logger.error(
          `${tag}: shipment failed for ${f.id}: ${err?.message ?? err}`
        )
      }
    }

    if (stage === "delivered" && !f.delivered_at) {
      // Medusa requires a shipment before delivery; create one quietly
      // first when staff jump straight to delivered (pickups, or an
      // order being reconciled after the fact).
      if (!f.shipped_at) {
        try {
          await createOrderShipmentWorkflow(container).run({
            input: {
              order_id: order.id,
              fulfillment_id: f.id,
              items: shipItems,
              no_notification: true,
            },
          })
        } catch (err: any) {
          logger.warn(
            `${tag}: pre-delivery shipment failed for ${f.id}: ${
              err?.message ?? err
            }`
          )
        }
      }
      try {
        // NB: camelCase here — this workflow's input is the odd one out
        // among the order fulfilment workflows, which all take snake_case.
        await markOrderFulfillmentAsDeliveredWorkflow(container).run({
          input: { orderId: order.id, fulfillmentId: f.id },
        })
        logger.info(`${tag}: marked fulfillment ${f.id} delivered.`)
      } catch (err: any) {
        logger.error(
          `${tag}: delivery failed for ${f.id}: ${err?.message ?? err}`
        )
      }
    }
  }
}

/**
 * Graph values arrive undecorated, so a quantity can be a plain number
 * or a raw BigNumber-ish `{ value: "1" }`. Normalise both.
 */
export function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const raw =
    v && typeof v === "object" && "value" in (v as any) ? (v as any).value : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Order↔Fulfillment is a module link rather than an ORM relation, so it
 * is only reachable through the graph — `retrieveOrder` throws
 * "Entity 'Order' does not have property 'fulfillments'".
 */
async function loadFulfillments(query: any, orderId: string): Promise<any[]> {
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.items.line_item_id",
      "fulfillments.items.quantity",
    ],
    filters: { id: orderId },
  })
  const rows = ((data ?? []) as any[])[0]?.fulfillments ?? []
  return (rows as any[]).filter((f) => !f?.canceled_at)
}

/**
 * Picks the location covering the most of the order's inventory items.
 * Ties break on location id so the choice is stable across runs rather
 * than dependent on row order.
 */
export function pickBestLocation(
  levels: Array<{ location_id?: string | null }>
): string | undefined {
  const tally = new Map<string, number>()
  for (const l of levels ?? []) {
    const id = l?.location_id
    if (typeof id !== "string" || !id) continue
    tally.set(id, (tally.get(id) ?? 0) + 1)
  }
  return [...tally.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0]?.[0]
}

/**
 * Where to fulfil from, in order of authority:
 *
 *   1. The order's reservations — stock is already committed there.
 *   2. Any location that actually holds a level for these items.
 *   3. undefined, letting Medusa fall back to the shipping option's
 *      location.
 *
 * Step 2 is not redundant: a dropshipped order releases its reservations
 * once the supplier ships (confirmed on order #41 — stock present at AS
 * Colour Warehouse, reserved 0, no reservation rows). Without it those
 * orders fall through to step 3, which always resolves to Australian
 * Warehouse and throws "Inventory level for item … not found".
 */
async function resolveLocationId(
  inventoryModule: any,
  query: any,
  items: any[],
  logger: any,
  tag: string
): Promise<string | undefined> {
  const lineItemIds = items.map((i) => i?.id).filter(Boolean)
  if (lineItemIds.length) {
    try {
      const reservations: any[] = await inventoryModule.listReservationItems(
        { line_item_id: lineItemIds },
        { take: 100 }
      )
      const locationId = reservations?.find((r) => r?.location_id)?.location_id
      if (typeof locationId === "string" && locationId) return locationId
    } catch (err: any) {
      logger.warn(`${tag}: reservation lookup failed: ${err?.message ?? err}`)
    }
  }

  const skus = items
    .map((i) => i?.variant_sku)
    .filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
  if (!skus.length) return undefined

  try {
    const { data: invItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id"],
      filters: { sku: skus },
    })
    const ids = ((invItems ?? []) as any[]).map((i) => i.id).filter(Boolean)
    if (!ids.length) return undefined

    const { data: levels } = await query.graph({
      entity: "inventory_level",
      fields: ["location_id", "inventory_item_id"],
      filters: { inventory_item_id: ids },
    })
    return pickBestLocation((levels ?? []) as any[])
  } catch (err: any) {
    logger.warn(`${tag}: inventory level lookup failed: ${err?.message ?? err}`)
    return undefined
  }
}

export const config: SubscriberConfig = {
  event: PRODUCTION_STAGE_EVENT,
}
