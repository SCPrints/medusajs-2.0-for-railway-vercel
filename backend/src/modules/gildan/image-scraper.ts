/**
 * Resolve Gildan image filenames (e.g. "102_Blush_01.jpg") into their full
 * BigCommerce CDN URLs by scraping the gildanbrands.com.au product page.
 *
 * Gildan's xlsx has filenames only — no URLs, no clean prefix. The actual
 * URL on cdn11.bigcommerce.com appends an unpredictable hash + timestamp:
 *
 *   xlsx: 102_Blush_01.jpg
 *   CDN:  .../products/1889/6041/102_Blush_01__72716.1764901939.jpg
 *
 * One page per style covers all colour variants (~65 images), so a full
 * catalog (97 styles × 1 fetch) finishes in under a minute even with
 * throttling. The result is cached to disk so subsequent imports only hit
 * the network for styles they haven't seen before.
 *
 * Caching shape: one JSON file per styleParent at
 *   <cache_dir>/<brand-slug>/<style>.json
 * holding `{ scrapedAt: ISO, urlByFilename: Record<filename, url> }`.
 */

import fs from "node:fs"
import path from "node:path"
import { slugify } from "../../utils/string-case"

/** Stem of an image filename without extension or hash suffix. */
const filenameStem = (s: string): string => {
  const base = s.replace(/\.(jpg|jpeg|png|webp)$/i, "")
  // Strip BigCommerce's "__HHHHH.TTTTTTTTTT" suffix in case we feed a
  // CDN URL back through (defensive).
  return base.replace(/__\d+\.\d+$/, "")
}

// Capture the full /images/stencil/<size>w/products/<pid>/<iid>/<file>.ext
// segment so we can rewrite the size to a consistent 1280w bucket.
const FULL_CDN_PATH_RE =
  /\/images\/stencil\/(\d+)w\/products\/(\d+)\/(\d+)\/([A-Za-z0-9_\-]+__\d+\.\d+\.(?:jpg|jpeg|png|webp))/g

/**
 * Parse a Gildan product page's HTML and return a map of
 * `xlsx-filename` → `full CDN URL` (normalised to the 1280w bucket).
 *
 * Pure — accepts the raw HTML so callers can unit-test against fixtures
 * without spinning up an HTTP client.
 */
export function extractImageUrlsFromGildanHtml(
  html: string
): Map<string, string> {
  const out = new Map<string, string>()
  if (!html) return out
  for (const match of html.matchAll(FULL_CDN_PATH_RE)) {
    const productId = match[2]
    const imageId = match[3]
    const cdnFilename = match[4] // e.g. "102_Blush_01__72716.1764901939.jpg"
    const stem = filenameStem(cdnFilename)
    // Always normalise to 1280w so the storefront gets a consistent
    // resolution regardless of which srcset variant we matched first.
    const url = `https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/${productId}/${imageId}/${cdnFilename}`
    // First occurrence wins; map every plausible extension form so
    // xlsx-supplied `.jpg` filenames still resolve when the CDN actually
    // serves `.webp` (and vice-versa).
    if (!out.has(`${stem}.jpg`)) out.set(`${stem}.jpg`, url)
    if (!out.has(`${stem}.jpeg`)) out.set(`${stem}.jpeg`, url)
    if (!out.has(`${stem}.png`)) out.set(`${stem}.png`, url)
    if (!out.has(`${stem}.webp`)) out.set(`${stem}.webp`, url)
  }
  return out
}

export type GildanImageScraperOptions = {
  /**
   * Inter-request delay in ms. Gildan's storefront is BigCommerce-hosted so
   * it tolerates a steady stream, but we throttle to be polite. 300ms ≈
   * 3 req/sec → 97 styles ≈ 30s total.
   */
  delayMs?: number
  /** Per-request timeout, ms. Defaults to 15000. */
  timeoutMs?: number
  /**
   * On-disk cache directory. Defaults to `/tmp/gildan-image-cache`. Set
   * via env var `GILDAN_IMAGE_SCRAPE_CACHE_DIR` in production so the
   * cache survives across deploys.
   */
  cacheDir?: string
  /**
   * Optional logger — receives one line per cache hit / miss / error.
   */
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void }
  /**
   * Disable disk cache (for tests). Defaults to false.
   */
  noCache?: boolean
  /**
   * Optional HTTP fetcher override (for tests). Defaults to global fetch.
   */
  fetcher?: (url: string, init?: any) => Promise<{ ok: boolean; text(): Promise<string>; status: number }>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type CacheRow = {
  scrapedAt: string
  urlByFilename: Record<string, string>
}

const cachePathFor = (
  cacheDir: string,
  brand: string,
  styleParent: string
): string => path.join(cacheDir, slugify(brand), `${slugify(styleParent)}.json`)

function readCache(file: string): CacheRow | null {
  try {
    const raw = fs.readFileSync(file, "utf8")
    const parsed = JSON.parse(raw) as CacheRow
    if (!parsed || typeof parsed !== "object" || !parsed.urlByFilename) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(file: string, row: CacheRow): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(row), "utf8")
  } catch {
    // Cache failures are not fatal — log via the caller's logger.
  }
}

/**
 * Scraper instance. Reuses the cache directory + fetcher across many
 * styles so a single import touches the file system once per style.
 */
export class GildanImageScraper {
  private readonly delayMs: number
  private readonly timeoutMs: number
  private readonly cacheDir: string
  private readonly noCache: boolean
  private readonly fetcher: NonNullable<GildanImageScraperOptions["fetcher"]>
  private readonly logger: GildanImageScraperOptions["logger"]
  /**
   * Stats — useful for the admin UI to surface what happened. Re-reset
   * between imports if you re-use the instance.
   */
  public stats = { cacheHits: 0, cacheMisses: 0, fetchErrors: 0, fetched: 0 }

  constructor(opts: GildanImageScraperOptions = {}) {
    this.delayMs = opts.delayMs ?? 300
    this.timeoutMs = opts.timeoutMs ?? 15000
    this.cacheDir =
      opts.cacheDir ??
      process.env.GILDAN_IMAGE_SCRAPE_CACHE_DIR ??
      "/tmp/gildan-image-cache"
    this.noCache = opts.noCache ?? false
    this.fetcher = opts.fetcher ?? defaultFetcher
    this.logger = opts.logger
  }

  /**
   * Look up CDN URLs for every image filename in a Gildan product.
   * Reads the cache; if missing, fetches the product URL once and
   * persists the map. Returns an empty map if `productUrl` is null/empty
   * or all fetches fail.
   */
  async resolveImageUrls(opts: {
    brand: string
    styleParent: string
    productUrl: string | null | undefined
    filenames: ReadonlyArray<string>
  }): Promise<Map<string, string>> {
    const { brand, styleParent, productUrl, filenames } = opts
    const result = new Map<string, string>()
    if (!productUrl) return result

    const cacheFile = cachePathFor(this.cacheDir, brand, styleParent)
    let cached: CacheRow | null = null
    if (!this.noCache) cached = readCache(cacheFile)

    let urlByFilename: Map<string, string>
    if (cached) {
      this.stats.cacheHits++
      urlByFilename = new Map(Object.entries(cached.urlByFilename))
    } else {
      this.stats.cacheMisses++
      try {
        const html = await this.fetchWithTimeout(productUrl)
        urlByFilename = extractImageUrlsFromGildanHtml(html)
        this.stats.fetched++
        if (!this.noCache) {
          writeCache(cacheFile, {
            scrapedAt: new Date().toISOString(),
            urlByFilename: Object.fromEntries(urlByFilename),
          })
        }
        await sleep(this.delayMs)
      } catch (err: any) {
        this.stats.fetchErrors++
        this.logger?.warn?.(
          `[gildan-image-scraper] fetch failed for ${productUrl}: ${err?.message ?? err}`
        )
        return result
      }
    }

    // Lookup filenames against the map. Filenames are case-sensitive
    // matches against what xlsx ships; if a colour is missing from the
    // scraped page entirely (e.g. just-released colour Gildan hasn't
    // photographed yet), no URL is returned for that filename.
    for (const f of filenames) {
      const url = urlByFilename.get(f)
      if (url) result.set(f, url)
    }
    return result
  }

  /** Pre-warm the cache for a list of (brand, style, url) tuples. */
  async warmCache(
    styles: ReadonlyArray<{
      brand: string
      styleParent: string
      productUrl: string | null
    }>
  ): Promise<void> {
    for (const s of styles) {
      if (!s.productUrl) continue
      const cacheFile = cachePathFor(this.cacheDir, s.brand, s.styleParent)
      if (!this.noCache && readCache(cacheFile)) {
        this.stats.cacheHits++
        continue
      }
      this.stats.cacheMisses++
      try {
        const html = await this.fetchWithTimeout(s.productUrl)
        const map = extractImageUrlsFromGildanHtml(html)
        this.stats.fetched++
        if (!this.noCache) {
          writeCache(cacheFile, {
            scrapedAt: new Date().toISOString(),
            urlByFilename: Object.fromEntries(map),
          })
        }
        this.logger?.info?.(
          `[gildan-image-scraper] warmed ${s.brand}/${s.styleParent} (${map.size} URLs)`
        )
      } catch (err: any) {
        this.stats.fetchErrors++
        this.logger?.warn?.(
          `[gildan-image-scraper] fetch failed for ${s.productUrl}: ${err?.message ?? err}`
        )
      }
      await sleep(this.delayMs)
    }
  }

  private async fetchWithTimeout(url: string): Promise<string> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const resp = await this.fetcher(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SC-Prints-Importer/1.0; +https://scprints.com.au)",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
        },
        signal: ctrl.signal,
      } as any)
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }
      return await resp.text()
    } finally {
      clearTimeout(timer)
    }
  }
}

const defaultFetcher: NonNullable<GildanImageScraperOptions["fetcher"]> = async (
  url,
  init
) => {
  const resp = await fetch(url, init as any)
  return {
    ok: resp.ok,
    status: resp.status,
    text: () => resp.text(),
  }
}
