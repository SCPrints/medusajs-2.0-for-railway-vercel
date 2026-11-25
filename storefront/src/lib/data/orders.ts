"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cache } from "react"
import { authedNextHeaders } from "./sdk-helpers"

import type { CustomizerMetadata } from "@modules/customizer/lib/types"
import { mergeApprovedProofs } from "@modules/customizer/lib/approved-proof-design"

// `+items.metadata` is required to surface the customizer payload
// (`metadata.customizerDesign`) that the order summary thumbnail needs to
// render the customer's mockup instead of a bare product photo. Medusa 2.14
// no longer includes line item `metadata` in the default response payload,
// so without this explicit `+`, OrderCard falls back to the variant
// thumbnail and historical orders look like uncustomized products.
// `+metadata`: a single-order fetch leaves the order's own metadata out by default,
// and the tracker, proof approval, PO number and payment terms all read it
// (allowed in backend/src/api/middlewares.ts).
const ORDER_FIELDS =
  "+metadata,*payment_collections.payments,*fulfillments,+fulfillments.metadata,+fulfillments.labels,*shipping_methods,+shipping_methods.detail,+items.metadata"

// No-op: Medusa now returns shipping/payment amounts in major units (decimals), same scale as
// `price.amount`. The previous ÷100 normaliser was double-dividing and turning $16.50 shipping into
// $0.17 on the order confirmation page.
const normalizeOrderUnits = <T extends Record<string, any>>(order: T): T => order

export const retrieveOrder = cache(async function (id: string) {
  const headers = await authedNextHeaders({ tags: ["order"] })
  return sdk.store.order
    .retrieve(id, { fields: ORDER_FIELDS }, headers)
    .then(({ order }) => normalizeOrderUnits(order as any))
    .catch((err) => medusaError(err))
})

/**
 * Returns the saved customizer state for a single line item on a past order, or
 * null if the line wasn't built with the customizer (or doesn't belong to the
 * caller). Used by the customizer to rehydrate when arriving via
 * `?reorder=<order_id>:<line_item_id>`.
 */
export const getOrderLineCustomizerMetadata = cache(async function (
  orderId: string,
  lineItemId: string
): Promise<CustomizerMetadata | null> {
  try {
    const order = await retrieveOrder(orderId)
    const items = (order as { items?: Array<{ id: string; metadata?: Record<string, unknown> }> })
      ?.items
    if (!items?.length) return null
    const line = items.find((i) => i.id === lineItemId)
    const raw = line?.metadata?.customizerDesign
    if (!raw || typeof raw !== "object") return null
    const candidate = raw as Partial<CustomizerMetadata>
    if (candidate.type !== "fabric_customizer") return null
    // Heavy vector designs store sideLayouts in R2 instead of inline (backend
    // write-time archiving). Re-inline here (server-side, so no CORS) so
    // reorder / revised-proof rehydration replays the full canvas.
    if (
      (!Array.isArray(candidate.sideLayouts) ||
        candidate.sideLayouts.length === 0) &&
      typeof candidate.sideLayouts_archived_url === "string"
    ) {
      try {
        const resp = await fetch(candidate.sideLayouts_archived_url, {
          signal: AbortSignal.timeout(15_000),
        })
        if (resp.ok) {
          const parsed: unknown = await resp.json()
          const layouts = Array.isArray(parsed)
            ? parsed
            : (parsed as { sideLayouts?: unknown })?.sideLayouts
          if (Array.isArray(layouts)) {
            candidate.sideLayouts = layouts as CustomizerMetadata["sideLayouts"]
          }
        }
      } catch {
        // Soft-fail: rehydration proceeds without layouts (blank canvas)
        // rather than breaking the page.
      }
    }
    // Staff-fixed artwork (revised proofs) wins over the customer's first
    // upload, so a re-order reprints what was approved.
    return mergeApprovedProofs(
      candidate as CustomizerMetadata,
      (order as { metadata?: Record<string, unknown> })?.metadata?.revised_proofs,
      lineItemId
    ).design
  } catch {
    return null
  }
})

// Hide org-fulfillment orders from the customer's personal order history
// (Phase 2 Q10). The primary contact on a fulfillment org would otherwise
// see every org-restock alongside their personal orders. Fulfillment
// orders surface under /account/organisations/[id]/orders instead.
//
// Caveat: the Medusa store `order.list` endpoint doesn't accept metadata
// filters, so we filter post-fetch. To keep the requested `limit` honest,
// we over-fetch and slice — costs an extra row scan but the customer's
// list is typically small.
const OVER_FETCH_MULTIPLIER = 3
const MAX_OVER_FETCH = 100

export const listOrders = cache(async function (
  limit: number = 10,
  offset: number = 0
) {
  const headers = await authedNextHeaders({ tags: ["order"] })
  const overFetch = Math.min(
    MAX_OVER_FETCH,
    Math.max(limit, limit * OVER_FETCH_MULTIPLIER)
  )
  return sdk.store.order
    // Newest first: the account overview's "Latest order" and "Same again?"
    // read the first row, and the API's default order is oldest first.
    .list({ limit: overFetch, offset, fields: ORDER_FIELDS, order: "-created_at" } as any, headers)
    .then(({ orders }) => {
      const filtered = (orders ?? []).filter(
        (o: any) => o?.metadata?.fulfillment_order !== true
      )
      return filtered.slice(0, limit).map((o: any) => normalizeOrderUnits(o))
    })
    .catch((err) => medusaError(err))
})

/* ------------------------------------------------------------------ *
 * Order history paging + re-order (customer portal, Nov 2026).
 * Dynamic imports keep this block self-contained at the end of the file.
 * ------------------------------------------------------------------ */

type StoreOrder = import("@medusajs/types").HttpTypes.StoreOrder

/**
 * One page of the customer's order history plus whether more exist.
 * `limit` counts raw orders, so a page can come back a little short when
 * org-fulfillment orders are filtered out; `hasMore` still tells the truth.
 */
export const listOrdersPage = cache(async function (
  limit: number = 10,
  offset: number = 0
): Promise<{ orders: StoreOrder[]; hasMore: boolean }> {
  const headers = await authedNextHeaders({ tags: ["order"] })
  try {
    const { orders, count } = await sdk.store.order.list(
      { limit, offset, fields: ORDER_FIELDS, order: "-created_at" } as any,
      headers
    )
    const filtered = (orders ?? []).filter(
      (o: any) => o?.metadata?.fulfillment_order !== true
    )
    return {
      orders: filtered.map((o: any) => normalizeOrderUnits(o)),
      hasMore: offset + limit < (count ?? 0),
    }
  } catch {
    return { orders: [], hasMore: false }
  }
})

// Lighter field set for "From past orders": just what design grouping needs.
const ORDER_LINES_FIELDS =
  "id,display_id,created_at,metadata,*items,+items.metadata"
// ponytail: 4 pages of 50 = the newest 200 orders; page further if a customer outgrows it.
const ALL_ORDERS_PAGE = 50
const ALL_ORDERS_MAX_PAGES = 4

/** Every one of my orders (newest first) with line metadata, for design grouping. */
export const listAllMyOrdersWithLines = cache(async function (): Promise<
  StoreOrder[]
> {
  const headers = await authedNextHeaders({ tags: ["order"] })
  const out: StoreOrder[] = []
  try {
    for (let page = 0; page < ALL_ORDERS_MAX_PAGES; page++) {
      const { orders, count } = await sdk.store.order.list(
        {
          limit: ALL_ORDERS_PAGE,
          offset: page * ALL_ORDERS_PAGE,
          fields: ORDER_LINES_FIELDS,
          order: "-created_at",
        } as any,
        headers
      )
      out.push(
        ...(orders ?? []).filter(
          (o: any) => o?.metadata?.fulfillment_order !== true
        )
      )
      if ((page + 1) * ALL_ORDERS_PAGE >= (count ?? 0)) break
    }
  } catch {
    // Soft-fail: show whatever we got.
  }
  return out
})

export type NeedsStaffLine = {
  line_item_id: string
  title: string
  reason: string
}

export type OrderAgainResult =
  | {
      ok: true
      added_lines: number
      needs_staff: NeedsStaffLine[]
      /** Set when the job went to our team instead of the cart: its reference. */
      sent_to_team?: string
      /** Why it went to the team. */
      approval_reason?: "needs_setup" | "quoted_price"
    }
  | { ok: false; error: string }

/**
 * One-click re-order: copies the order's studio lines (or just `lineIds`)
 * into my cart at today's prices, using the artwork our team approved.
 * A job that needs our check (lines we set up by hand, or a quoted price for
 * a customer without a pricing tier) goes to the team whole instead — one
 * job, one payment — and `sent_to_team` carries its reference.
 */
export async function orderAgain(
  orderId: string,
  lineIds?: string[],
  countryCode: string = process.env.NEXT_PUBLIC_DEFAULT_REGION || "au"
): Promise<OrderAgainResult> {
  const [{ getAuthHeaders }, { getOrSetCart }, { updateTag }] =
    await Promise.all([
      import("./cookies"),
      import("./cart"),
      import("next/cache"),
    ])
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to re-order." }
  }
  try {
    const cart = await getOrSetCart(countryCode)
    if (!cart?.id) return { ok: false, error: "Could not open your cart." }
    const res = (await sdk.client.fetch(
      `/store/customers/me/orders/${encodeURIComponent(orderId)}/order-again`,
      {
        method: "POST",
        headers,
        body: {
          cart_id: cart.id,
          ...(lineIds?.length ? { line_ids: lineIds } : {}),
        },
      }
    )) as {
      added_lines?: number
      needs_staff?: NeedsStaffLine[]
      requires_approval?: boolean
      approval_reason?: "needs_setup" | "quoted_price"
    }
    if (res.requires_approval) {
      const sent = await requestReorder(orderId, lineIds)
      if (!sent.ok) return sent
      return {
        ok: true,
        added_lines: 0,
        needs_staff: res.needs_staff ?? [],
        sent_to_team: sent.public_id,
        approval_reason: res.approval_reason ?? "needs_setup",
      }
    }
    updateTag("cart")
    return {
      ok: true,
      added_lines: res.added_lines ?? 0,
      needs_staff: res.needs_staff ?? [],
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? err.message
          : "Could not re-order. Please try again.",
    }
  }
}

/** Ask the team to re-order lines the cart can't take. Creates a job; staff email a quote. */
export async function requestReorder(
  orderId: string,
  lineIds?: string[],
  note?: string
): Promise<
  { ok: true; quote_id: string; public_id: string } | { ok: false; error: string }
> {
  const { getAuthHeaders } = await import("./cookies")
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to re-order." }
  }
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/orders/${encodeURIComponent(orderId)}/reorder-request`,
      {
        method: "POST",
        headers,
        body: {
          ...(lineIds?.length ? { line_ids: lineIds } : {}),
          ...(note?.trim() ? { note: note.trim().slice(0, 2000) } : {}),
        },
      }
    )) as { quote_id: string; public_id: string }
    return { ok: true, quote_id: res.quote_id, public_id: res.public_id }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? err.message
          : "Could not send your request. Please try again.",
    }
  }
}
