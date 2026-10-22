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

/**
 * Feed images, best front view first, with audited-dead URLs removed.
 *
 * CLAUDE.md hard rule: never pick a garment image by array position — repair/
 * scrape scripts append and reorder freely. Rank thumbnail + gallery and lead
 * with the best front view; `[0]` becomes `g:image_link`.
 *
 * ponytail: no >=500x500 check. Medusa image rows carry no width/height and
 * nothing stamps dimensions in metadata, so size-aware picking needs the
 * image audit to record dimensions first.
 */
export const feedImages = (product: FeedImageSource): string[] => {
  const dead = brokenUrls(product.metadata)
  return [product.thumbnail, ...(product.images ?? []).map((i) => i?.url)]
    .filter((url): url is string => Boolean(url) && !dead.has(url as string))
    .filter((url, index, all) => all.indexOf(url) === index)
    .map((url, index) => ({ url, index, rank: garmentUrlViewRank(url) }))
    // Stable: rank first, original order as the tiebreak.
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.url)
}
