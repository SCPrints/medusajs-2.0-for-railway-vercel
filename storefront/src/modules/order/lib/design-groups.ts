import { HttpTypes } from "@medusajs/types"

import { getCustomizerMetadata } from "@modules/customizer/lib/metadata"

/**
 * Groups order lines into "designs" for re-order. Pure (no React, no fetch)
 * so the order page, the designs page and the account home share it.
 */

export type AnyLineItem = NonNullable<HttpTypes.StoreOrder["items"]>[number]

export type DesignGroup = {
  /** Stable key derived from product + uploaded files + render artifacts. */
  fingerprint: string
  /** Any line in the group, used for design metadata + the reorder deep-link. */
  representativeLine: AnyLineItem
  lines: AnyLineItem[]
  productHandle: string | null
  productTitle: string
  totalQty: number
}

const urlsOf = (list: unknown[], key: "url" | "printUrl"): string =>
  list
    .map((f) => (f as Record<string, unknown>)?.[key])
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .sort()
    .join("|")

/**
 * Identifies "the same design" across lines of ONE order. Lines from the same
 * cart-add (e.g. 13 sizes of a tee) share the customer's uploaded files AND
 * the server-rendered artifact URLs. Different sessions get fresh file keys
 * and artifact UUIDs, so re-uploads don't collapse.
 * File URLs cover upload designs; artifact URLs cover text/shape-only ones.
 */
export function fingerprintDesign(line: AnyLineItem): string {
  const productId = (line as { product_id?: string }).product_id ?? ""
  const meta = getCustomizerMetadata(line)
  const fileUrls = urlsOf(meta?.customerOriginalFiles ?? [], "url")
  const artifactUrls = urlsOf(meta?.artifacts ?? [], "printUrl")
  return `${productId}::${fileUrls}::${artifactUrls}`
}

/** True when the line was built in the Studio (has a customizer design). */
export const isStudioLine = (line: AnyLineItem): boolean =>
  getCustomizerMetadata(line) !== null

export function groupOrderLinesByDesign(items: AnyLineItem[]): DesignGroup[] {
  const groups = new Map<string, DesignGroup>()
  for (const line of items) {
    if (!isStudioLine(line)) continue
    const fingerprint = fingerprintDesign(line)
    const existing = groups.get(fingerprint)
    const qty = typeof line.quantity === "number" ? line.quantity : 0
    if (existing) {
      existing.lines.push(line)
      existing.totalQty += qty
    } else {
      groups.set(fingerprint, {
        fingerprint,
        representativeLine: line,
        lines: [line],
        productHandle:
          (line as { product_handle?: string | null }).product_handle ?? null,
        productTitle: line.product_title || line.title || "Custom design",
        totalQty: qty,
      })
    }
  }
  return Array.from(groups.values())
}

/**
 * Same artwork across orders: a re-order replays the customer's original
 * files (new render artifacts), so product + original-file URLs is the key.
 * Designs with no uploaded file (text only) fall back to the per-order
 * fingerprint and stay separate.
 */
export function artworkKey(line: AnyLineItem): string {
  const meta = getCustomizerMetadata(line)
  const fileUrls = urlsOf(meta?.customerOriginalFiles ?? [], "url")
  if (!fileUrls) return fingerprintDesign(line)
  const productId = (line as { product_id?: string }).product_id ?? ""
  return `${productId}::${fileUrls}`
}

/** True when staff saved an approved proof design for any of these lines. */
export function hasApprovedProof(revisedProofs: unknown, lineIds: string[]): boolean {
  if (!Array.isArray(revisedProofs)) return false
  const ids = new Set(lineIds)
  return revisedProofs.some((p) => {
    const proof = p as { line_item_id?: unknown; design?: { objects?: unknown } | null }
    return (
      typeof proof?.line_item_id === "string" &&
      ids.has(proof.line_item_id) &&
      Array.isArray(proof.design?.objects)
    )
  })
}

/** A design the customer has ordered before, rolled up across orders. */
export type PastOrderDesign = {
  key: string
  productHandle: string | null
  productTitle: string
  thumbnail: string | null
  mockupUrl: string | null
  orderCount: number
  totalQty: number
  lastOrderedAt: string
  /** Newest order carrying this design: what "Order again" copies. */
  latestOrderId: string
  latestDisplayId: number | string | null
  latestLineIds: string[]
  /** Line used for the Studio `?reorder=<orderId>:<lineId>` link. */
  latestLineId: string
}

type OrderLike = {
  id: string
  display_id?: number | string | null
  created_at?: string | Date | null
  items?: AnyLineItem[] | null
}

const firstMockupUrl = (line: AnyLineItem): string | null => {
  const meta = getCustomizerMetadata(line)
  for (const a of meta?.artifacts ?? []) {
    const url = (a as { mockupUrl?: unknown })?.mockupUrl
    if (typeof url === "string" && url) return url
  }
  return null
}

/** Rolls the studio lines of many orders into one card per design, newest first. */
export function groupPastOrderDesigns(orders: OrderLike[]): PastOrderDesign[] {
  const byKey = new Map<string, PastOrderDesign & { orderIds: Set<string> }>()
  const sorted = [...orders].sort(
    (a, b) => Date.parse(String(b.created_at ?? 0)) - Date.parse(String(a.created_at ?? 0))
  )
  for (const order of sorted) {
    const createdAt = String(order.created_at ?? "")
    for (const group of groupOrderLinesByDesign(order.items ?? [])) {
      const key = artworkKey(group.representativeLine)
      const existing = byKey.get(key)
      if (existing) {
        existing.orderIds.add(order.id)
        existing.orderCount = existing.orderIds.size
        existing.totalQty += group.totalQty
        // Orders are newest first, so the first one seen stays "latest".
        if (existing.latestOrderId === order.id) {
          existing.latestLineIds.push(...group.lines.map((l) => l.id))
        }
        continue
      }
      const line = group.representativeLine
      byKey.set(key, {
        key,
        productHandle: group.productHandle,
        productTitle: group.productTitle,
        thumbnail: line.thumbnail ?? null,
        mockupUrl: firstMockupUrl(line),
        orderCount: 1,
        totalQty: group.totalQty,
        lastOrderedAt: createdAt,
        latestOrderId: order.id,
        latestDisplayId: order.display_id ?? null,
        latestLineIds: group.lines.map((l) => l.id),
        latestLineId: line.id,
        orderIds: new Set([order.id]),
      })
    }
  }
  return Array.from(byKey.values()).map((d) => {
    const { orderIds, ...rest } = d
    void orderIds
    return rest
  })
}
