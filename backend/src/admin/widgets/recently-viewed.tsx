import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import { Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { PALETTE } from "../lib/reports/palette"
import {
  RECENTLY_VIEWED_STORAGE_KEY,
  readRecentlyViewed,
  type RecentlyViewedEntry,
} from "../lib/recently-viewed-storage"

/**
 * Sidebar widget on the orders list page that surfaces the last few records
 * the operator opened. Storage logic lives in `lib/recently-viewed-storage.ts`
 * so the per-entity tracker widgets can share it without a widget→widget
 * import. Cross-tab sync via the `storage` event.
 */

const TYPE_LABEL: Record<RecentlyViewedEntry["type"], string> = {
  order: "Order",
  customer: "Customer",
  product: "Product",
}

const TYPE_COLOR: Record<RecentlyViewedEntry["type"], string> = {
  order: PALETTE.teal700,
  customer: PALETTE.amber600,
  product: PALETTE.slate700,
}

const RecentlyViewedSidebar = () => {
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>([])

  useEffect(() => {
    const loadEntries = () => setEntries(readRecentlyViewed())
    loadEntries()
    if (typeof window === "undefined") return
    const onStorage = (e: StorageEvent) => {
      if (e.key === RECENTLY_VIEWED_STORAGE_KEY) loadEntries()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  if (entries.length === 0) return null

  const formatRelative = (iso: string): string => {
    const ms = Date.parse(iso ?? "")
    if (!Number.isFinite(ms)) return ""
    const diff = Date.now() - ms
    if (diff < 60_000) return "just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return `${Math.floor(diff / 86_400_000)}d ago`
  }

  return (
    <Container className="flex flex-col gap-y-2 p-4">
      <Heading level="h2" className="text-base font-semibold">
        Recently viewed
      </Heading>
      <Text size="xsmall" className="text-ui-fg-subtle">
        Your last {entries.length} record{entries.length === 1 ? "" : "s"} —
        clears when you clear browser storage.
      </Text>
      <ul className="flex flex-col gap-y-1 mt-1">
        {entries.map((e) => (
          <li key={`${e.type}-${e.id}`}>
            <a
              href={e.href}
              className="flex items-center gap-x-2 px-2 py-1.5 rounded hover:bg-ui-bg-subtle"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span
                className="text-[10px] uppercase tracking-wide font-semibold w-14 shrink-0"
                style={{ color: TYPE_COLOR[e.type] }}
              >
                {TYPE_LABEL[e.type]}
              </span>
              <Text size="small" className="flex-1 truncate">
                {e.title}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted shrink-0">
                {formatRelative(e.viewed_at)}
              </Text>
            </a>
          </li>
        ))}
      </ul>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default withWidgetBoundary(RecentlyViewedSidebar, "recently-viewed")
