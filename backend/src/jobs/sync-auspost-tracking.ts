import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createOrderShipmentWorkflow } from "@medusajs/medusa/core-flows"

import {
  AUSPOST_ACCOUNT_NUMBER,
  AUSPOST_API_KEY,
  AUSPOST_API_PASSWORD,
  AUSPOST_TEST_MODE,
} from "../lib/constants"
import { AusPostClient } from "../modules/auspost/client"
import { buildAusPostTrackingUrl } from "../modules/auspost/mapping"
import type { AusPostTrackingResult } from "../modules/auspost/types"

const TRACK_BATCH_SIZE = 10
const LOOKBACK_DAYS = 60
const TERMINAL_STATUSES = new Set(["Delivered", "Returned"])

type ParcelEvent = {
  description: string
  location: string | null
  /** Widget + email expect `event_date_time`; AusPost v1 source field is `date`. */
  event_date_time: string
  signer_name: string | null
}

type ParcelRecord = {
  tracking_number?: string | null
  tracking_url?: string | null
  shipment_id?: string | null
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  label_url?: string | null
  tracking_status?: string | null
  events?: ParcelEvent[]
  shipped_at?: string | null
}

type FulfillmentItemRow = { line_item_id?: string | null; quantity?: number | null }

type FulfillmentRow = {
  id: string
  provider_id?: string | null
  data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  items?: FulfillmentItemRow[] | null
}

/** Flatten AusPost trackable_items[].events[] into a single chronological list. */
const flattenEvents = (result: AusPostTrackingResult): ParcelEvent[] => {
  const events: ParcelEvent[] = []
  for (const ti of result.trackable_items || []) {
    for (const e of ti.events || []) {
      events.push({
        description: e.description,
        location: e.location || null,
        event_date_time: e.date,
        signer_name: e.signer_name || null,
      })
    }
  }
  // Oldest → newest by timestamp where parseable.
  return events.sort((a, b) => {
    const ta = Date.parse(a.event_date_time)
    const tb = Date.parse(b.event_date_time)
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
    return ta - tb
  })
}

/**
 * Every-4h cron — AusPost has no webhook push, so we poll the Track API and
 * materialise events into `fulfillment.metadata.parcels[]` (same shape the
 * ShipStation webhook writes, so the storefront tracking-list + order-shipped
 * email read it provider-agnostically).
 *
 * On the FIRST scan that surfaces any tracking event, we run
 * `createOrderShipmentWorkflow` (exactly as the ShipStation webhook does) so
 * the order is actually marked shipped in Medusa AND the ORDER_SHIPPED email
 * fires — not just an event emitted into the void.
 *
 * No-ops silently if AUSPOST_API_KEY is unset (dev / pre-go-live state).
 */
export default async function syncAusPostTracking(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // Gate on the full credential triple — same set medusa-config requires to
  // register the provider. Construct the client directly from env (mirroring
  // the ShipStation webhook) rather than resolving the fulfillment provider
  // from the container, whose registration key isn't a stable public API.
  if (!AUSPOST_API_KEY || !AUSPOST_API_PASSWORD || !AUSPOST_ACCOUNT_NUMBER) {
    logger.debug("AusPost tracking sync: credentials unset, skipping.")
    return
  }

  const client = new AusPostClient({
    api_key: AUSPOST_API_KEY,
    api_password: AUSPOST_API_PASSWORD,
    account_number: AUSPOST_ACCOUNT_NUMBER,
    test_mode: AUSPOST_TEST_MODE,
  })
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as {
    updateFulfillment?: (
      id: string,
      data: { metadata?: Record<string, unknown> }
    ) => Promise<unknown>
  }

  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "created_at",
      "metadata",
      "fulfillments.id",
      "fulfillments.provider_id",
      "fulfillments.data",
      "fulfillments.metadata",
      "fulfillments.items.line_item_id",
      "fulfillments.items.quantity",
    ],
    pagination: { take: 1000, skip: 0 },
  })

  const pending: Array<{
    order_id: string
    fulfillment: FulfillmentRow
    tracking_id: string
  }> = []

  for (const order of (orders as any[]) ?? []) {
    const createdAt = Date.parse(order?.created_at ?? "")
    if (!Number.isFinite(createdAt) || createdAt < Date.parse(since)) continue

    for (const f of (order.fulfillments ?? []) as FulfillmentRow[]) {
      const providerId = f.provider_id || ""
      if (!providerId.startsWith("auspost_")) continue

      const trackingId =
        ((f.data as Record<string, unknown> | null)?.tracking_id as string) || null
      if (!trackingId) continue

      const status =
        (((f.metadata as Record<string, unknown> | null)?.tracking_status as
          | string
          | undefined) ?? "") || ""
      if (status && TERMINAL_STATUSES.has(status)) continue

      pending.push({ order_id: order.id, fulfillment: f, tracking_id: trackingId })
    }
  }

  if (pending.length === 0) {
    logger.debug("AusPost tracking sync: nothing to poll.")
    return
  }

  logger.info(
    `AusPost tracking sync: polling ${pending.length} active fulfillment(s)`
  )

  for (let i = 0; i < pending.length; i += TRACK_BATCH_SIZE) {
    const batch = pending.slice(i, i + TRACK_BATCH_SIZE)
    const ids = batch.map((p) => p.tracking_id)

    let resp
    try {
      resp = await client.getTracking(ids)
    } catch (err) {
      logger.warn(
        `AusPost tracking sync: batch ${i / TRACK_BATCH_SIZE + 1} failed: ${
          (err as Error).message
        }`
      )
      continue
    }

    const byId = new Map<string, AusPostTrackingResult>(
      (resp.tracking_results || []).map((r) => [r.tracking_id, r])
    )

    for (const row of batch) {
      const result = byId.get(row.tracking_id)
      if (!result) continue

      const events = flattenEvents(result)
      const fdata = (row.fulfillment.data as Record<string, unknown> | null) || {}

      const parcel: ParcelRecord = {
        tracking_number: row.tracking_id,
        tracking_url: buildAusPostTrackingUrl(row.tracking_id),
        shipment_id: (fdata.shipment_id as string) || null,
        carrier_code: "australia_post",
        carrier_id: "auspost",
        service_code: (fdata.product_id as string) || null,
        label_url: (fdata.label_url as string) || null,
        tracking_status: result.status || null,
        events,
        // Oldest event = dispatch. events is sorted oldest→newest, so [0] —
        // the last index would track the latest scan (i.e. delivery), making
        // shipped_at drift forward on every poll.
        shipped_at: events.length ? events[0]?.event_date_time : null,
      }

      const existingMetadata =
        (row.fulfillment.metadata as Record<string, unknown> | null) || {}
      const isFirstScan = !existingMetadata.shipment_synced_at

      // Always persist the latest parcel snapshot (events drive the widget +
      // the customer-facing tracking page) regardless of shipment status.
      try {
        await fulfillmentService.updateFulfillment?.(row.fulfillment.id, {
          metadata: {
            ...existingMetadata,
            provider: "auspost",
            parcels: [parcel],
            tracking_status: result.status || null,
            last_polled_at: new Date().toISOString(),
          },
        })
      } catch (err) {
        logger.warn(
          `AusPost tracking sync: failed to update fulfillment ${row.fulfillment.id}: ${
            (err as Error).message
          }`
        )
        continue
      }

      // First time we see a real tracking event, create the Medusa shipment
      // (marks items shipped + emits shipment.created → ORDER_SHIPPED
      // email). Mirrors the ShipStation webhook's createOrderShipmentWorkflow
      // call. Only stamp shipment_synced_at once the workflow succeeds so a
      // transient failure retries on the next tick.
      if (isFirstScan && events.length > 0) {
        try {
          await createOrderShipmentWorkflow(container).run({
            input: {
              order_id: row.order_id,
              fulfillment_id: row.fulfillment.id,
              items: (row.fulfillment.items || [])
                .filter((it) => !!it.line_item_id)
                .map((it) => ({
                  id: it.line_item_id as string,
                  quantity: typeof it.quantity === "number" ? it.quantity : 1,
                })),
              labels: [
                {
                  tracking_number: row.tracking_id,
                  tracking_url: buildAusPostTrackingUrl(row.tracking_id),
                  label_url: (fdata.label_url as string) || "",
                },
              ],
            },
          })

          await fulfillmentService.updateFulfillment?.(row.fulfillment.id, {
            metadata: {
              ...existingMetadata,
              provider: "auspost",
              parcels: [parcel],
              tracking_status: result.status || null,
              last_polled_at: new Date().toISOString(),
              shipment_synced_at: new Date().toISOString(),
            },
          })
        } catch (err) {
          logger.warn(
            `AusPost tracking sync: createOrderShipmentWorkflow failed for ${row.fulfillment.id} (will retry next tick): ${
              (err as Error).message
            }`
          )
        }
      }
    }
  }
}

export const config = {
  name: "sync-auspost-tracking",
  // Every 4 hours; by mid-morning local the first event of an overnight
  // dispatch is visible. Cron fires at 0,4,8,12,16,20 UTC.
  schedule: "0 */4 * * *",
}
