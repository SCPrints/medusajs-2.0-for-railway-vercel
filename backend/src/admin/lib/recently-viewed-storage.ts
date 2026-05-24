/**
 * LocalStorage-backed "recently viewed" list, shared by the sidebar widget
 * (orders list page) and the per-entity tracker widgets (order / customer /
 * product detail pages). Living here as a plain module — not inside a widget
 * file — so widgets import a normal module instead of importing helpers from
 * each other through a Medusa-admin default-export entry point.
 *
 * Cross-tab sync works because every consumer reads/writes the same
 * `RECENTLY_VIEWED_STORAGE_KEY` and the sidebar listens for the `storage`
 * event.
 */

export const RECENTLY_VIEWED_STORAGE_KEY = "sc:recently_viewed"
export const RECENTLY_VIEWED_MAX_ENTRIES = 8

export type RecentlyViewedEntry = {
  type: "order" | "customer" | "product"
  id: string
  title: string
  href: string
  viewed_at: string
}

/**
 * Push a new entry to the top of the list. De-duplicates by (type, id) so
 * revisiting an entity doesn't pollute the list with stale copies. Capped
 * at `RECENTLY_VIEWED_MAX_ENTRIES`.
 */
export function recordRecentlyViewed(
  entry: Omit<RecentlyViewedEntry, "viewed_at">
): void {
  if (typeof window === "undefined") return
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY)
    const list: RecentlyViewedEntry[] = raw ? JSON.parse(raw) : []
    const filtered = list.filter(
      (e) => !(e.type === entry.type && e.id === entry.id)
    )
    const next: RecentlyViewedEntry[] = [
      { ...entry, viewed_at: new Date().toISOString() },
      ...filtered,
    ].slice(0, RECENTLY_VIEWED_MAX_ENTRIES)
    localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* localStorage may be unavailable in private browsing — ignore */
  }
}

/**
 * Read the current list. Safe to call during SSR (returns []). Swallows
 * malformed-JSON errors so a single bad write never breaks the widget.
 */
export function readRecentlyViewed(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, RECENTLY_VIEWED_MAX_ENTRIES)
  } catch {
    return []
  }
}
