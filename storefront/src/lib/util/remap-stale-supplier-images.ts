/**
 * Known-good replacements for garment image URLs that 404 after supplier CDN
 * renames. Keys are normalized like `normalizeStaleSupplierImageLookupKey(url)`.
 * Extend here when audits find broken hi-res filenames.
 *
 * Verified with HEAD (200 vs 404) against the supplier origin.
 */
const STALE_LOOKUP_KEY_TO_REPLACEMENT = new Map<string, string>([
  // Neck Chief — old hi-res basename no longer hosted; canonical is `1701.jpg`.
  [
    "www.dncworkwear.com.au|/images/hires/1701349.jpg",
    "https://www.dncworkwear.com.au/images/hires/1701.jpg",
  ],
  [
    "dncworkwear.com.au|/images/hires/1701349.jpg",
    "https://www.dncworkwear.com.au/images/hires/1701.jpg",
  ],
  // Colour wheel URL removed server-side; reuse hero garment so PDP still loads.
  [
    "www.dncworkwear.com.au|/images/hires/1701colour.jpg",
    "https://www.dncworkwear.com.au/images/hires/1701.jpg",
  ],
  [
    "dncworkwear.com.au|/images/hires/1701colour.jpg",
    "https://www.dncworkwear.com.au/images/hires/1701.jpg",
  ],
])

/** Strip scheme + query — compare Apples-to-Apples regardless of tracking params */
export function normalizeStaleSupplierImageLookupKey(url: string): string | null {
  try {
    const u = url.trim()
    const noQuery = u.split(/[?#]/)[0] ?? u
    const parsed = new URL(noQuery.startsWith("//") ? `https:${noQuery}` : noQuery)
    const host = parsed.hostname.toLowerCase()
    const path = `${parsed.pathname}`.replace(/\/+$/, "")
    const pathSlash = path.startsWith("/") ? path : `/${path}`
    return `${host}|${pathSlash.toLowerCase()}`
  } catch {
    return null
  }
}

/**
 * Rewrite known-defunct garment image URLs before passing to `next/image` or
 * layout logic. Unknown URLs pass through unchanged.
 */
export function remapStaleExternalGarmentUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !url.trim()) {
    return null
  }
  const key = normalizeStaleSupplierImageLookupKey(url)
  if (!key) {
    return url
  }
  return STALE_LOOKUP_KEY_TO_REPLACEMENT.get(key) ?? url
}
