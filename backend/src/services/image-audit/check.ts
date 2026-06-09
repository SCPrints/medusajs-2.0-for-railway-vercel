/**
 * Image-liveness primitives for the product-image audit.
 *
 * The "Missing image" data-quality flag in /app/product-data only checks
 * whether `product.thumbnail` is a non-empty string — it never loads the
 * URL. A product whose thumbnail points at a dead URL (supplier CDN
 * rotated the file, a guessed/scraped URL was wrong, hotlinking blocked,
 * or an R2 object was GC'd) therefore reads as "has image" and slips past
 * the filter while rendering a broken-image icon in the catalog.
 *
 * This module HEAD-checks a thumbnail URL and classifies the result. The
 * pure helpers (classifyThumbnail / shouldStamp) are unit-tested; the
 * network check lives here too so callers have one import.
 */

export type ImageAuditStatus = "ok" | "broken" | "missing"

export type UrlCheck = { ok: boolean; status: number }

const isOk = (status: number) => status >= 200 && status < 400

async function fetchStatus(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number
): Promise<number> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method,
      signal: ctrl.signal,
      // Range on the GET fallback so we don't download whole images from
      // servers that reject HEAD — a Range-aware server answers 206 with
      // one byte; a Range-ignorant one still answers 200 and we cancel the
      // body immediately below.
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      redirect: "follow",
    })
    // Drain/cancel the body so a Range-ignorant server doesn't stream the
    // full image into memory while we only care about the status.
    try {
      await r.body?.cancel?.()
    } catch {
      /* body already consumed / unsupported — ignore */
    }
    return r.status
  } catch {
    return 0 // network error / abort / DNS failure → treat as unreachable
  } finally {
    clearTimeout(t)
  }
}

/**
 * Check whether an image URL resolves to something servable.
 *
 * HEAD first (cheap). 2xx/3xx → ok. 404/410 → definitively gone. Anything
 * ambiguous (405 method-not-allowed, 403, 0 network blip, 5xx) is retried
 * once with a ranged GET before we call it broken — plenty of image hosts
 * reject HEAD but serve GET fine, and we don't want those false-flagged.
 */
export async function checkImageUrl(
  url: string,
  timeoutMs: number
): Promise<UrlCheck> {
  const head = await fetchStatus(url, "HEAD", timeoutMs)
  if (isOk(head)) return { ok: true, status: head }
  if (head === 404 || head === 410) return { ok: false, status: head }

  const get = await fetchStatus(url, "GET", timeoutMs)
  return { ok: isOk(get), status: get || head }
}

/**
 * Decide the audit status for a product from its thumbnail + the liveness
 * check. Empty thumbnail is "missing" (the existing "Missing image" flag
 * owns that case); a populated-but-dead thumbnail is "broken".
 */
export function classifyThumbnail(
  thumbnail: string | null | undefined,
  check: UrlCheck | null
): ImageAuditStatus {
  const t = typeof thumbnail === "string" ? thumbnail.trim() : ""
  if (!t) return "missing"
  if (!check) return "missing"
  return check.ok ? "ok" : "broken"
}

/**
 * Whether to write a metadata update. We only persist transitions that
 * cross the "broken" boundary — that keeps the healthy majority of the
 * catalog untouched (no write, no product.updated reindex storm) and
 * still clears the flag when a previously-broken thumbnail is fixed.
 * ok↔missing churn (both non-broken) is ignored.
 */
export function shouldStamp(
  prev: ImageAuditStatus | undefined,
  next: ImageAuditStatus
): boolean {
  if (prev === next) return false
  return next === "broken" || prev === "broken"
}

export type ProductImagesClassification = {
  status: ImageAuditStatus
  /** Confirmed-dead URLs (thumbnail and/or gallery), deduped. */
  broken_urls: string[]
}

/**
 * Product-level status from the thumbnail AND every gallery image.
 *
 * Thumbnail-only auditing misses the failure mode that actually bites: a
 * supplier CDN rotates per-COLOUR files (2026-06-10: AS Colour killed
 * individual colour fronts on 10 products ~3 weeks before anyone noticed),
 * which leaves the thumbnail healthy while the PDP gallery and the
 * customizer canvas break for those colours. A product is "broken" if ANY
 * of its image URLs is confirmed dead; "missing" keeps its existing
 * thumbnail-level semantics.
 */
export function classifyProductImages(
  thumbnail: string | null | undefined,
  galleryUrls: ReadonlyArray<string | null | undefined>,
  checks: ReadonlyMap<string, UrlCheck>
): ProductImagesClassification {
  const thumb = typeof thumbnail === "string" ? thumbnail.trim() : ""
  const candidates = new Set<string>()
  if (thumb) candidates.add(thumb)
  for (const raw of galleryUrls) {
    const url = typeof raw === "string" ? raw.trim() : ""
    if (url) candidates.add(url)
  }

  const broken_urls = [...candidates].filter((url) => {
    const check = checks.get(url)
    return Boolean(check && !check.ok)
  })
  if (broken_urls.length) {
    return { status: "broken", broken_urls }
  }
  if (!thumb || !checks.get(thumb)) {
    return { status: "missing", broken_urls: [] }
  }
  return { status: "ok", broken_urls: [] }
}
