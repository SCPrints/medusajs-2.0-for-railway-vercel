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
  /** Supplier sub-catalog the item was listed under (FashionBiz brand), needed to import it. */
  group?: string
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
  /**
   * Set when the "not_listed" hides were refused (they stay in toHide for the
   * report). Explicit "discontinued" flags are always trusted.
   */
  hideBlockedReason: string | null
}

// ponytail: fixed guard — a bad supplier feed (partial page walk, API
// hiccup, a brand moved to another list) reads as "everything vanished".
// Only products missing from the feed count; a supplier's own discontinued
// flag is a deliberate signal. Tune if a supplier genuinely drops a big range.
export const HIDE_GUARD_MIN = 10
export const HIDE_GUARD_FRACTION = 0.1

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase()

// Things we can't decorate (Sean, 23 Nov 2026): never imported, not even as
// drafts. Checked against every live title: only socks, footwear, gloves,
// eye/ear PPE and small parts match ("Belt Loop Shorts", "Tie Dye",
// "knee pads not included" do not).
const UNPRINTABLE =
  /\b(socks?|gloves?|(gum)?boots?(?![- ]?cut)|boot covers?|shoes?|sneakers?|footwear|sandals?|goggles?|safety glass(es)?|browguards?|foot ?beds?|safety joggers?|threaders?|chef'?s buttons?|specs?|spectacles|ear ?muffs?|ear ?plugs?|knee ?pads?(?! not included)|zip pullers?|cummerbunds?|(neck)?ties?(?![- ]?(dye|back|front|up|waist))|belts?(?! ?loops?)|underwear|briefs?|boxers?|plastic pockets?)\b/i

export const isUnprintable = (name: string) => UNPRINTABLE.test(name)

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
    if (f.discontinued || seen.has(key) || isUnprintable(f.name)) return false
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

  const missing = toHide.filter((p) => p.reason === "not_listed").length
  const limit = Math.max(HIDE_GUARD_MIN, Math.ceil(published.length * HIDE_GUARD_FRACTION))
  const hideBlockedReason =
    missing > limit
      ? `${missing} live products are missing from the supplier's list (limit ${limit}). That looks like a bad supplier feed, so they were not hidden. Check them by hand.`
      : null

  return { toAdd, toHide, hideBlockedReason }
}
