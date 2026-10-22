import { garmentUrlViewRank } from "@modules/products/lib/variant-options"

type FeedImageSource = {
  thumbnail?: string | null
  images?: ({ url?: string | null } | null)[] | null
  metadata?: Record<string, unknown> | null
}

/**
 * URLs the backend image audit (backend/src/services/image-audit/run.ts)
 * confirmed dead (404/410). Merchant Center disapproves items whose
 * image_link 404s, so these are never emitted.
 *
 * ponytail: trusts the weekly audit stamp. It only re-stamps when a product's
 * broken-ness flips and caps the list at 20, so a URL that died after the last
 * stamp still slips through until the next run; a feed-time HEAD probe would
 * close that but costs ~60k requests per fetch.
 */
const brokenUrls = (metadata: FeedImageSource["metadata"]): Set<string> => {
  const audit = metadata?.image_audit as { broken_urls?: unknown } | undefined
  const urls = Array.isArray(audit?.broken_urls) ? audit.broken_urls : []
  return new Set(urls.filter((u): u is string => typeof u === "string"))
}

/** Google disapproves a primary image under 500x500 (from 31 Jan 2027). */
const MIN_PRIMARY_PX = 500

/**
 * Size tier from the audit's `image_audit.sizes` ([w, h] per URL):
 * 0 = known >= 500x500, 1 = unknown, 2 = known too small.
 */
const sizeTier = (metadata: FeedImageSource["metadata"]) => {
  const audit = metadata?.image_audit as { sizes?: unknown } | undefined
  const sizes =
    audit?.sizes && typeof audit.sizes === "object" ? (audit.sizes as Record<string, unknown>) : {}
  return (url: string): number => {
    const size = sizes[url]
    if (!Array.isArray(size) || typeof size[0] !== "number" || typeof size[1] !== "number") return 1
    return Math.min(size[0], size[1]) >= MIN_PRIMARY_PX ? 0 : 2
  }
}

/**
 * Feed images, best front view first, with audited-dead URLs removed.
 *
 * CLAUDE.md hard rule: never pick a garment image by array position — repair/
 * scrape scripts append and reorder freely. Rank thumbnail + gallery and lead
 * with the best front view; `[0]` becomes `g:image_link`.
 *
 * Size beats view: a known >=500x500 image leads, then unknown sizes, then
 * known-small ones, each tier front-view first. Products the audit hasn't
 * measured are all "unknown", i.e. pure front-view ranking.
 */
export const feedImages = (product: FeedImageSource): string[] => {
  const dead = brokenUrls(product.metadata)
  const tier = sizeTier(product.metadata)
  return [product.thumbnail, ...(product.images ?? []).map((i) => i?.url)]
    .filter((url): url is string => Boolean(url) && !dead.has(url as string))
    .filter((url, index, all) => all.indexOf(url) === index)
    .map((url, index) => ({ url, index, tier: tier(url), rank: garmentUrlViewRank(url) }))
    // Stable: size tier, then view rank, original order as the tiebreak.
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.url)
}
