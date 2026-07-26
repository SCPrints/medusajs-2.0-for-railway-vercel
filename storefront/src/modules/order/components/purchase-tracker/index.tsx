"use client"

import { useEffect } from "react"
import { HttpTypes } from "@medusajs/types"

import { lineItemToItem, metaPurchaseEventId, trackPurchase } from "@lib/analytics"
import { phCapture } from "@lib/posthog"

/**
 * Fires the GA4 `purchase` event exactly once per (transaction_id,
 * browser). Mounts on the order-confirmed page after server render
 * with the full order in scope. The wrapper inside `trackPurchase`
 * deduplicates via localStorage so a hard reload of the confirmation
 * page doesn't double-count.
 */
export const PurchaseTracker = ({ order }: { order: HttpTypes.StoreOrder }) => {
  useEffect(() => {
    if (!order?.id) return
    const txId = order.display_id ? String(order.display_id) : order.id
    const currency = (order.currency_code ?? "AUD").toUpperCase()
    const value = Number(order.total ?? 0)
    const items = (order.items ?? [])
      .map((it) => lineItemToItem(it as any))
      .filter((it): it is NonNullable<ReturnType<typeof lineItemToItem>> => Boolean(it))
    trackPurchase({
      transaction_id: txId,
      value,
      currency,
      tax: Number((order as any).tax_total ?? 0) || undefined,
      shipping: Number((order as any).shipping_total ?? 0) || undefined,
      items,
    })
    // Meta Conversions API twin of the browser Purchase pixel — shares the
    // event_id so Meta dedups. Guarded by localStorage so a confirmation-page
    // reload doesn't re-POST (belt-and-braces on top of event_id dedup).
    // No-ops server-side when the CAPI token isn't configured.
    const capiKey = `meta_capi_${txId}`
    let capiSent = false
    try {
      capiSent = Boolean(window.localStorage.getItem(capiKey))
    } catch {
      // localStorage disabled — fall through; event_id dedup still protects us.
    }
    if (!capiSent) {
      try {
        window.localStorage.setItem(capiKey, String(Date.now()))
      } catch {
        // ignore
      }
      fetch("/api/meta-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          event_id: metaPurchaseEventId(txId),
          event_source_url: window.location.href,
          value,
          currency,
          content_ids: items.map((it) => it.item_id),
          email: (order as any).email ?? undefined,
        }),
      }).catch(() => {
        // fire-and-forget; the browser pixel is the fallback
      })
    }
    phCapture("order_completed", {
      order_id: order.display_id ? String(order.display_id) : order.id,
      value: Number(order.total ?? 0),
      currency: (order.currency_code ?? "AUD").toUpperCase(),
      item_count: (order.items ?? []).length,
    })
  }, [order])
  return null
}
