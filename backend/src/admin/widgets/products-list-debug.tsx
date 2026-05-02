import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

import { sdk } from "../lib/sdk"

/** Matches Medusa dashboard default product table `fields` (see use-product-table-query DEFAULT_FIELDS). */
const DASHBOARD_LIST_FIELDS =
  "id,title,handle,status,*collection,*sales_channels,variants.id,thumbnail"

const INGEST =
  "http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0"

function debugPost(hypothesisId: string, message: string, data: Record<string, unknown>) {
  fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b9d87f",
    },
    body: JSON.stringify({
      sessionId: "b9d87f",
      hypothesisId,
      location: "products-list-debug.tsx",
      message,
      data,
      timestamp: Date.now(),
      runId: "admin-products",
    }),
  }).catch(() => {})
}

/**
 * Temporary debug widget: mounts before the core Products table so we get signals even when the table crashes.
 */
const ProductsListDebugWidget = () => {
  useEffect(() => {
    debugPost("HA", "product.list.before widget mounted", {})

    const onWindowError = (ev: ErrorEvent) => {
      debugPost("HD", "window error", {
        msg: String(ev.message ?? "").slice(0, 240),
      })
    }
    window.addEventListener("error", onWindowError)

    let cancelled = false
    void (async () => {
      try {
        const res = await sdk.admin.product.list({
          limit: 20,
          offset: 0,
          is_giftcard: false,
          fields: DASHBOARD_LIST_FIELDS,
          order: "-created_at",
        })
        if (cancelled) return
        const rows = res.products ?? []
        const summary = rows.slice(0, 15).map((p) => {
          const rec = p as Record<string, unknown>
          const sc = rec.sales_channels
          return {
            status: rec.status === undefined ? "__undefined__" : String(rec.status),
            thumbType: typeof rec.thumbnail,
            collectionKind:
              rec.collection === null
                ? "null"
                : rec.collection === undefined
                  ? "undefined"
                  : typeof rec.collection,
            scLen: Array.isArray(sc) ? sc.length : -1,
          }
        })
        debugPost("HB", "admin product.list dashboard-fields ok", {
          count: res.count ?? rows.length,
          rowSampleLen: summary.length,
          summary,
        })
      } catch (e: unknown) {
        if (!cancelled) {
          debugPost("HB", "admin product.list dashboard-fields threw", {
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener("error", onWindowError)
    }
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default ProductsListDebugWidget
