/**
 * Pure diff behind the nightly supplier catalog sync: which supplier styles
 * are new to us, and which of our live products the supplier has
 * discontinued or stopped listing. No I/O — see run.ts for the side effects.
 *
 * Products are matched on the supplier code stored in their metadata first,
 * then on handle, so a renamed AS Colour style (new title → new handle) is
 * never imported twice.
 */

export type FeedItem = {
  /** Supplier-scoped style key (AS Colour styleCode, "brand:slug", AP style_code). */
  code: string
  handle: string
  name: string
  discontinued: boolean
}

export type OurProduct = {
  id: string
  handle: string
  title: string
  status: string
  code: string | null
}

export type HideReason = "discontinued" | "not_listed"

export type CatalogSyncPlan = {
  toAdd: FeedItem[]
  toHide: Array<OurProduct & { reason: HideReason }>
  /** Set when hiding was refused; toHide is still listed for the report. */
  hideBlockedReason: string | null
}

// ponytail: fixed guard — a bad supplier feed (partial page walk, API
// hiccup) would otherwise read as "everything was discontinued" and empty
// the catalog. Tune these if a supplier genuinely retires a big range.
export const HIDE_GUARD_MIN = 10
export const HIDE_GUARD_FRACTION = 0.1

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase()

export function planCatalogSync(feed: FeedItem[], ours: OurProduct[]): CatalogSyncPlan {
  if (!feed.length) {
    return { toAdd: [], toHide: [], hideBlockedReason: "The supplier returned no products, so nothing was changed." }
  }

  const ourCodes = new Set(ours.map((p) => norm(p.code)).filter(Boolean))
  const ourHandles = new Set(ours.map((p) => norm(p.handle)))
  const feedByCode = new Map(feed.map((f) => [norm(f.code), f]))
  const feedByHandle = new Map(feed.map((f) => [norm(f.handle), f]))

  const seen = new Set<string>()
  const toAdd = feed.filter((f) => {
    const key = norm(f.code)
    if (f.discontinued || seen.has(key)) return false
    seen.add(key)
    return !ourCodes.has(key) && !ourHandles.has(norm(f.handle))
  })

  const published = ours.filter((p) => p.status === "published")
  const toHide: CatalogSyncPlan["toHide"] = []
  for (const p of published) {
    const match = (p.code ? feedByCode.get(norm(p.code)) : undefined) ?? feedByHandle.get(norm(p.handle))
    if (!match) toHide.push({ ...p, reason: "not_listed" })
    else if (match.discontinued) toHide.push({ ...p, reason: "discontinued" })
  }

  const limit = Math.max(HIDE_GUARD_MIN, Math.ceil(published.length * HIDE_GUARD_FRACTION))
  const hideBlockedReason =
    toHide.length > limit
      ? `${toHide.length} products would be hidden (limit ${limit}). That looks like a bad supplier feed, so none were hidden. Check them by hand.`
      : null

  return { toAdd, toHide, hideBlockedReason }
}
