/**
 * Fire-and-forget storefront cache invalidation.
 *
 * The storefront's `/api/revalidate-products` route accepts a tag array and
 * calls Next 16's `revalidateTag(tag, "max")` on each one. This helper wraps
 * the POST so subscribers and mutating routes can call it without each one
 * re-implementing the auth + URL plumbing.
 *
 * Requires:
 *   - STOREFRONT_URL (no trailing slash)
 *   - REVALIDATE_SECRET (same value as on the storefront)
 *
 * If either env var is unset, the call no-ops and logs once — dev
 * environments without these vars stay quiet.
 *
 * Failures are swallowed and logged; we never block a mutation because the
 * storefront couldn't be reached. Cached data goes stale at `cacheLife`
 * regardless, so a missed purge degrades to "edits show up after the
 * revalidate window" rather than "edits never appear."
 */

const STOREFRONT_URL = process.env.STOREFRONT_URL?.replace(/\/$/, "")
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET?.trim()
const REVALIDATE_TIMEOUT_MS = 5_000

let warnedMissing = false
function warnMissingOnce(logger?: { warn?: (msg: string) => void }) {
  if (warnedMissing) return
  warnedMissing = true
  const reasons: string[] = []
  if (!STOREFRONT_URL) reasons.push("STOREFRONT_URL")
  if (!REVALIDATE_SECRET) reasons.push("REVALIDATE_SECRET")
  const msg = `[storefront-revalidate] skipping (missing env: ${reasons.join(", ")})`
  if (logger?.warn) logger.warn(msg)
  else console.warn(msg)
}

export type RevalidateTags = readonly string[]

/**
 * POST the given tags to the storefront revalidate endpoint. Returns true on
 * a 2xx response, false on any failure (logged).
 *
 * Callers should NOT await this in hot paths — it's safe to discard the
 * promise. A short timeout keeps a stalled storefront from holding up the
 * caller more than a few seconds.
 */
export async function revalidateStorefrontTags(
  tags: RevalidateTags,
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string) => void }
): Promise<boolean> {
  if (!STOREFRONT_URL || !REVALIDATE_SECRET) {
    warnMissingOnce(logger)
    return false
  }
  const clean = Array.from(
    new Set(
      tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
    )
  )
  if (clean.length === 0) {
    return false
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REVALIDATE_TIMEOUT_MS)

  try {
    const res = await fetch(`${STOREFRONT_URL}/api/revalidate-products`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${REVALIDATE_SECRET}`,
      },
      body: JSON.stringify({ tags: clean }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      const msg = `[storefront-revalidate] ${res.status} ${res.statusText} — ${text.slice(0, 200)}`
      if (logger?.warn) logger.warn(msg)
      else console.warn(msg)
      return false
    }

    if (logger?.info) {
      logger.info(`[storefront-revalidate] purged tags: ${clean.join(", ")}`)
    }
    return true
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? `[storefront-revalidate] ${err.name}: ${err.message}`
        : `[storefront-revalidate] unknown error`
    if (logger?.warn) logger.warn(msg)
    else console.warn(msg)
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

/* ---- Tag builders ---- */

export const tagsForProduct = (handle?: string | null): string[] => {
  const out = ["products", "home-featured"]
  const h = handle?.trim().toLowerCase()
  if (h) out.push(`product-${h}`)
  return out
}

export const tagsForBrand = (handle?: string | null): string[] => {
  const out = ["brands"]
  const h = handle?.trim().toLowerCase()
  if (h) out.push(`brand-${h}`)
  return out
}

export const tagsForCategory = (): string[] => ["categories"]

export const tagsForCollection = (handle?: string | null): string[] => {
  const out = ["collections"]
  const h = handle?.trim().toLowerCase()
  if (h) out.push(`collection-${h}`)
  return out
}
