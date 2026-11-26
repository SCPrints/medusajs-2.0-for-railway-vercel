import { Modules } from "@medusajs/framework/utils"
import type { IOrderModuleService } from "@medusajs/framework/types"

import { mergeApprovedProofs, type MergeApprovedProofsResult } from "../../lib/approved-proof-design"
import { listCustomerOrgs, SHARE_ROLES } from "../../lib/customer-org-sharing"
import type { OrderLineLike } from "../../lib/reorder-lines"
import { restoreSideLayouts } from "../../lib/side-layouts-archive"

export type ReorderSourceOrder = {
  id: string
  display_id: number | null
  customer_id: string | null
  email: string | null
  currency_code: string | null
  metadata: Record<string, any>
  items: OrderLineLike[]
  /** Staff cancelled it: problems and size swaps are refused. */
  canceled?: boolean
}

const num = (v: unknown): number => {
  const n = Number(v && typeof v === "object" ? Number(v) : v)
  return Number.isFinite(n) ? n : 0
}

/**
 * The customer's own order with its current lines (retrieveOrder decorates
 * quantity / unit_price and serves the edited line snapshot). null when it
 * isn't theirs — callers answer 404, never 403.
 */
export async function loadOwnOrder(
  scope: { resolve: (key: string) => unknown },
  orderId: string,
  customerId: string
): Promise<ReorderSourceOrder | null> {
  const order = await loadOrderLines(scope, orderId)
  return order && order.customer_id === customerId ? order : null
}

/**
 * An order the customer may re-order: their own, or one placed for an
 * organisation where they're an owner or purchaser (a colleague's order).
 * Viewers and outsiders get null → 404.
 */
export async function loadReorderableOrder(
  scope: { resolve: (key: string) => unknown },
  orderId: string,
  customerId: string
): Promise<ReorderSourceOrder | null> {
  const order = await loadOrderLines(scope, orderId)
  if (!order) return null
  if (order.customer_id === customerId) return order
  const orgId = order.metadata?.organisation_id
  if (typeof orgId !== "string" || !orgId) return null
  const orgs = await listCustomerOrgs(scope as any, customerId)
  const membership = orgs.find((o) => o.organisation_id === orgId)
  return membership && SHARE_ROLES.includes(membership.role) ? order : null
}

/** Any order with its current lines; null when missing. No ownership check. */
export async function loadOrderLines(
  scope: { resolve: (key: string) => unknown },
  orderId: string
): Promise<ReorderSourceOrder | null> {
  const orders = scope.resolve(Modules.ORDER) as IOrderModuleService
  let raw: any
  try {
    raw = await orders.retrieveOrder(orderId, { relations: ["items"] })
  } catch {
    return null
  }
  if (!raw) return null
  return {
    id: raw.id,
    display_id: raw.display_id ?? null,
    customer_id: raw.customer_id,
    email: raw.email ?? null,
    currency_code: raw.currency_code ?? null,
    metadata: (raw.metadata ?? {}) as Record<string, any>,
    canceled: raw.status === "canceled" || !!raw.canceled_at,
    items: ((raw.items ?? []) as any[]).map((i) => ({
      id: i.id,
      title: i.title ?? null,
      product_title: i.product_title ?? null,
      variant_title: i.variant_title ?? null,
      product_handle: i.product_handle ?? null,
      product_id: i.product_id ?? null,
      variant_id: i.variant_id ?? null,
      quantity: Math.max(1, Math.floor(num(i.quantity))),
      unit_price: num(i.unit_price),
      thumbnail: i.thumbnail ?? null,
      metadata: (i.metadata ?? {}) as Record<string, any>,
    })),
  }
}

/** The line's design with archived layouts re-inlined and the approved proofs swapped in. */
export async function approvedDesignFor(
  order: ReorderSourceOrder,
  line: OrderLineLike
): Promise<MergeApprovedProofsResult<Record<string, any>>> {
  const design = (line.metadata?.customizerDesign ?? {}) as Record<string, any>
  const proofs = order.metadata.revised_proofs
  // No approved proof design for this line: keep the design (and any
  // archived layouts) exactly as ordered.
  if (mergeApprovedProofs(design, proofs, line.id).replacedSides.length === 0) {
    return { design, replacedSides: [], appliedProofs: [] }
  }
  return mergeApprovedProofs(await restoreSideLayouts(design), proofs, line.id)
}
