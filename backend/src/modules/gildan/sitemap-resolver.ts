/**
 * Resolves Gildan product URLs from the gildanbrands.com.au products
 * sitemap (BigCommerce-generated `/xmlsitemap.php?type=products&page=1`).
 *
 * Why a separate resolver instead of using the URL the xlsx ships in
 * column 35: those URLs are stale. The xlsx says
 * `gildan-softstyle-sf500/` but the live URL is
 * `gildan-softstyle-sf500-hoodie/` (the supplier appends the garment
 * type slug). 60/77 styles in the 2026-01 file had 404-ing xlsx URLs,
 * which is why the first import only landed images on the 17 that
 * happened to have correct URLs.
 *
 * Strategy: fetch the sitemap ONCE per importer run, tokenise every
 * URL's last path segment, and pick out the alphanumeric tokens with
 * at least one digit (those are the style codes — Gildan uses
 * `sf500`, `h000`, `64v00`, `5400b`, etc.). Build a single
 * `Map<lowercased-style, URL>` for O(1) lookups. The first-occurrence
 * wins so we don't overwrite a real product URL with a category URL
 * that happens to share a token.
 *
 * Pure parser is exported so unit tests can run against fixtures
 * without hitting the network.
 */

const SITEMAP_URL =
  "https://gildanbrands.com.au/xmlsitemap.php?type=products&page=1"

const LOC_RE = /<loc>([^<]+)<\/loc>/g

/** Lower-cased style-code token from a URL slug. */
const isStyleCodeCandidate = (token: string): boolean => {
  if (token.length < 3) return false
  if (!/[0-9]/.test(token)) return false
  // Pure-numeric tokens like "1", "2025" should still pass if >= 3 chars.
  return /^[a-z0-9]+$/i.test(token)
}

/**
 * Parse a Gildan sitemap XML body and return Map<style-code → URL>.
 * Style codes are case-folded to lowercase. Multiple URLs sharing a
 * style code keep the first one seen.
 */
export function parseGildanSitemap(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!xml) return out
  for (const match of xml.matchAll(LOC_RE)) {
    const url = match[1].trim()
    if (!url) continue
    const slug = url.replace(/\/$/, "").split("/").pop() ?? ""
    if (!slug) continue
    for (const rawToken of slug.split("-")) {
      const token = rawToken.toLowerCase()
      if (!isStyleCodeCandidate(token)) continue
      if (!out.has(token)) out.set(token, url)
    }
  }
  return out
}

export type GildanSitemapResolverOptions = {
  /**
   * Override the sitemap URL. Default targets the live
   * `/xmlsitemap.php?type=products&page=1`. The Gildan storefront
   * paginates the sitemap only once per type so page=1 covers the full
   * catalog as of 2026-01.
   */
  sitemapUrl?: string
  /** Per-request timeout, ms. Default 15000. */
  timeoutMs?: number
  /** Logger sink. */
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void }
  /** Override the fetcher (for tests). */
  fetcher?: (
    url: string,
    init?: any
  ) => Promise<{ ok: boolean; text(): Promise<string>; status: number }>
}

/**
 * Lazy-loads the sitemap on first lookup, caches the parsed style→URL
 * map for the rest of the instance's lifetime. Safe to share across
 * many style lookups in a single importer run.
 */
export class GildanSitemapResolver {
  private readonly sitemapUrl: string
  private readonly timeoutMs: number
  private readonly fetcher: NonNullable<GildanSitemapResolverOptions["fetcher"]>
  private readonly logger: GildanSitemapResolverOptions["logger"]
  private mapPromise: Promise<Map<string, string>> | null = null

  constructor(opts: GildanSitemapResolverOptions = {}) {
    this.sitemapUrl = opts.sitemapUrl ?? SITEMAP_URL
    this.timeoutMs = opts.timeoutMs ?? 15000
    this.fetcher = opts.fetcher ?? defaultFetcher
    this.logger = opts.logger
  }

  /**
   * Resolve a Gildan style code (e.g. "SF500", "h000", "64V00") to the
   * canonical product URL. Returns null if the style isn't in the
   * sitemap — typically a brand-new release that hasn't been published
   * on gildanbrands.com.au yet.
   */
  async resolve(styleParent: string): Promise<string | null> {
    if (!styleParent) return null
    const map = await this.load()
    return map.get(styleParent.toLowerCase()) ?? null
  }

  /** For instrumentation — count of URLs in the cached sitemap. */
  async size(): Promise<number> {
    return (await this.load()).size
  }

  private load(): Promise<Map<string, string>> {
    if (this.mapPromise) return this.mapPromise
    this.mapPromise = (async () => {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
        try {
          const resp = await this.fetcher(this.sitemapUrl, {
            headers: {
              "user-agent":
                "Mozilla/5.0 (compatible; SC-Prints-Importer/1.0; +https://scprints.com.au)",
              accept: "application/xml,text/xml,*/*",
            },
            signal: ctrl.signal,
          } as any)
          if (!resp.ok) {
            this.logger?.warn?.(
              `[gildan-sitemap] HTTP ${resp.status} for ${this.sitemapUrl}; falling back to xlsx URLs.`
            )
            return new Map<string, string>()
          }
          const xml = await resp.text()
          const map = parseGildanSitemap(xml)
          this.logger?.info?.(
            `[gildan-sitemap] loaded ${map.size} style code mappings from sitemap.`
          )
          return map
        } finally {
          clearTimeout(timer)
        }
      } catch (err: any) {
        this.logger?.warn?.(
          `[gildan-sitemap] fetch failed: ${err?.message ?? err}; falling back to xlsx URLs.`
        )
        return new Map<string, string>()
      }
    })()
    return this.mapPromise
  }
}

const defaultFetcher: NonNullable<GildanSitemapResolverOptions["fetcher"]> =
  async (url, init) => {
    const resp = await fetch(url, init as any)
    return {
      ok: resp.ok,
      status: resp.status,
      text: () => resp.text(),
    }
  }
