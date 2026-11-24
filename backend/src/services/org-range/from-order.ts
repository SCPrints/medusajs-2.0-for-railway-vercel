/**
 * Staff put a finished job's designs into an organisation's range, so every
 * owner / purchaser of that organisation can order them again ("Our range").
 * The design row is owned by the order's customer (so they can still edit it
 * in "My designs") and shared with the organisation. The artwork is the
 * APPROVED proof where there is one. Idempotent per design group: the order
 * remembers which design each group became (`organisation_range`).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { writeAudit } from "../../lib/audit-log"
import { listCustomerOrgs } from "../../lib/customer-org-sharing"
import { mergeOrderMetadata } from "../../lib/order-metadata"
import { designThumbnail, rangeGroupsFromOrder } from "../../lib/org-range-from-order"
import { DESIGNS_MODULE } from "../../modules/designs"
import type DesignsModuleService from "../../modules/designs/service"
import { approvedDesignFor, loadOrderLines } from "../reorder/load"

export type OrderRangeState = {
  customer_id: string | null
  /** Organisations the order's customer belongs to (the only valid targets). */
  organisations: Array<{ id: string; name: string }>
  /** The organisation this order is already placed for, if any. */
  organisation_id: string | null
  groups: Array<{ group_key: string; title: string; thumbnail: string | null; design_id: string | null }>
}

const rangeMap = (meta: Record<string, any>): Record<string, string> =>
  meta.organisation_range && typeof meta.organisation_range === "object" ? meta.organisation_range : {}

async function load(container: MedusaContainer, orderId: string) {
  const order = await loadOrderLines(container, orderId)
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  return order
}

export async function getOrderRangeState(
  container: MedusaContainer,
  orderId: string
): Promise<OrderRangeState> {
  const order = await load(container, orderId)
  const orgs = order.customer_id ? await listCustomerOrgs(container, order.customer_id) : []
  const added = rangeMap(order.metadata)
  const groups = await Promise.all(
    rangeGroupsFromOrder(order.items).map(async (g) => {
      const merged = await approvedDesignFor(order, g.line)
      return {
        group_key: g.group_key,
        title: g.title,
        thumbnail: designThumbnail(merged.design) ?? g.line.thumbnail ?? null,
        design_id: added[g.group_key] ?? null,
      }
    })
  )
  return {
    customer_id: order.customer_id,
    organisations: orgs.map((o) => ({ id: o.organisation_id, name: o.organisation_name })),
    organisation_id: typeof order.metadata.organisation_id === "string" ? order.metadata.organisation_id : null,
    groups,
  }
}

export async function addOrderToRange(
  container: MedusaContainer,
  input: { orderId: string; organisationId: string; actorId?: string | null; groupKeys?: string[] | null }
): Promise<{ added: number; skipped: number }> {
  const order = await load(container, input.orderId)
  if (!order.customer_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This order has no customer account to own the designs.")
  }
  const orgs = await listCustomerOrgs(container, order.customer_id)
  if (!orgs.some((o) => o.organisation_id === input.organisationId)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${order.email ?? "This customer"} isn't a member of that organisation. Add them on the Organisations page first.`
    )
  }
  const tagged = order.metadata.organisation_id
  if (typeof tagged === "string" && tagged && tagged !== input.organisationId) {
    throw new MedusaError(MedusaError.Types.CONFLICT, "This order was placed for a different organisation.")
  }

  const wanted = input.groupKeys?.length ? new Set(input.groupKeys) : null
  const added = rangeMap(order.metadata)
  const designs = container.resolve<DesignsModuleService>(DESIGNS_MODULE)
  const created: Record<string, string> = {}
  let skipped = 0
  for (const g of rangeGroupsFromOrder(order.items)) {
    if (wanted && !wanted.has(g.group_key)) continue
    if (added[g.group_key]) {
      skipped++
      continue
    }
    const merged = await approvedDesignFor(order, g.line)
    const [row] = await designs.createDesigns([
      {
        customer_id: order.customer_id,
        organisation_id: input.organisationId,
        name: g.title.slice(0, 120),
        thumbnail_url: designThumbnail(merged.design) ?? g.line.thumbnail ?? null,
        base_product_id: g.line.product_id ?? null,
        base_variant_id: g.line.variant_id ?? null,
        customizer_metadata: merged.design,
      },
    ])
    created[g.group_key] = (row as any).id
  }

  // Tag the order too, so it shows in the organisation's order history.
  if (Object.keys(created).length || !tagged) {
    await mergeOrderMetadata(container, order.id, {
      organisation_id: input.organisationId,
      organisation_range: { ...added, ...created },
    })
  }
  if (Object.keys(created).length) {
    await writeAudit({
      container,
      entity: AUDIT_ENTITY.ORGANISATION,
      entity_id: input.organisationId,
      action: AUDIT_ACTION.DESIGN_CREATED,
      actor_id: input.actorId ?? null,
      details: { source: "order_range", order_id: order.id, design_ids: Object.values(created) },
    })
  }
  return { added: Object.keys(created).length, skipped }
}
