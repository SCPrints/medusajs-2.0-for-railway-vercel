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
import type { GildanSitemapResolver } from "./sitemap-resolver"

/** Stem of an image filename without extension or hash suffix. */
const filenameStem = (s: string): string => {
  const base = s.replace(/\.(jpg|jpeg|png|webp)$/i, "")
  // Strip BigCommerce's "__HHHHH.TTTTTTTTTT" suffix in case we feed a
  // CDN URL back through (defensive).
  return base.replace(/__\d+\.\d+$/, "")
}

// Capture the full /images/stencil/<size>/products/<pid>/<iid>/<file>.ext
// segment so we can rewrite the size to a consistent 1280w bucket. Size
// can be either the legacy `1280w` form OR the newer `1280x1280` form
// — observed in the same page across pre-2026 and post-2026 product
// uploads on gildanbrands.com.au. Filename is matched permissively
// (allowing `.` and `_` inside the stem) so the multi-suffix CDN form
// `H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg`
// captures too; the suffix groups are then stripped in JS.
const FULL_CDN_PATH_RE =
  /\/images\/stencil\/(\d+(?:w|x\d+))\/products\/(\d+)\/(\d+)\/([A-Za-z0-9_.\-]+\.(?:jpg|jpeg|png|webp))/gi

/** Strip a base filename's trailing `__<digits>(.<digits>)*` suffix groups. */
const stripFilenameSuffixes = (base: string): string =>
  base.replace(/(__\d+(?:\.\d+)*)+$/, "")

/**
 * Normalise a Gildan filename (xlsx or CDN) to a canonical lookup key.
 * The supplier ships different naming conventions on the website vs
 * the data file; this collapses them onto a single comparable form so
 * lookups succeed regardless of which form was supplied. All key
 * differences observed in the 2026-01 catalog:
 *
 *   xlsx                            CDN
 *   1466_Black_01.jpg               1466_Black_US24_A1__...jpg
 *   1469_BlueJean_01.jpg            1469_BlueJean_US24_D1__...jpg
 *   1567_BlueJean_01.jpg            1567_Blue_Jean_1__...jpg
 *   65000B_White_01.jpg             65000B_WHITE_01__...jpg
 *   H000_White_01.jpg               H000_White_A4__...jpg
 *
 * Normalisation pipeline:
 *   1. Strip extension and CDN `__N.N` suffix groups.
 *   2. Lowercase.
 *   3. Strip `_us<digits>` season tags (e.g. _us24, _us25).
 *   4. Collapse multiple underscores.
 *   5. Pad the trailing ordinal — optional letter prefix (A/D/P/...)
 *      followed by digits — to two digits without the prefix.
 *   6. Collapse middle tokens (everything between style and ordinal)
 *      into one — joins `Blue_Jean` to `bluejean`, `Heather_Grey` to
 *      `heathergrey`, etc. Style codes don't contain underscores so
 *      the first token is always the style.
 *   7. Re-append `.jpg` as the canonical extension.
 *
 * Exported so `mapping.ts:buildGildanGarmentImages` can normalise
 * xlsx-side filenames before looking them up in the URL map.
 */
export function normalizeGildanFilenameKey(filename: string): string {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, "")
  const stripped = stripFilenameSuffixes(base)
  let s = stripped.toLowerCase()
  s = s.replace(/_us\d+/g, "")
  // xlsx ships split colours like "Black/White" or "Htr Indigo" while the
  // CDN concatenates ("BlackWhite", "HtrIndigo"). Strip slashes and
  // spaces so the colour token collapses to the CDN form.
  s = s.replace(/[\s\/\\]+/g, "")
  s = s.replace(/_+/g, "_").replace(/^_|_$/g, "")
  s = s.replace(/_([a-z])?(\d+)$/, (_, _prefix, d) => `_${d.padStart(2, "0")}`)
  const parts = s.split("_").filter(Boolean)
  if (parts.length >= 3) {
    const style = parts[0]
    const ordinal = parts[parts.length - 1]
    const middle = parts.slice(1, -1).join("")
    s = `${style}_${middle}_${ordinal}`
  }
  return `${s}.jpg`
}

/**
 * Parse a Gildan product page's HTML and return a map of
 * `normalized xlsx-filename key` → `full CDN URL` (1280w bucket).
 *
 * Pure — accepts the raw HTML so callers can unit-test against fixtures
 * without spinning up an HTTP client. Callers MUST run input filenames
 * through `normalizeGildanFilenameKey` before looking them up.
 */
export function extractImageUrlsFromGildanHtml(
  html: string
): Map<string, string> {
  const out = new Map<string, string>()
  if (!html) return out
  for (const match of html.matchAll(FULL_CDN_PATH_RE)) {
    const productId = match[2]
    const imageId = match[3]
    const cdnFilename = match[4] // e.g. "H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg"
    const url = `https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/${productId}/${imageId}/${cdnFilename}`
    const key = normalizeGildanFilenameKey(cdnFilename)
    if (!out.has(key)) out.set(key, url)
  }
  return out
}

/**
 * Normalise a Gildan colour label to a stable lookup key for the page's
 * `data-color-name` swatch map. The website occasionally prefixes a shade
 * with a marketing token the data file omits — Gildan's current sport grey
 * is "RS Sport Grey" on gildanbrands.com.au but just "Sport Grey" in the
 * xlsx. Strip that leading token and collapse to alphanumerics so
 * "RS Sport Grey", "Sport Grey", and "sport-grey" all key to "sportgrey".
 *
 * Exported so `mapping.ts:buildGildanGarmentImages` (and the repair script)
 * can key colour names against `extractColorImageMapFromGildanHtml`'s output.
 */
export function normalizeGildanColourKey(name: string): string {
  const s = (name ?? "")
    .toLowerCase()
    .trim()
    // Leading marketing / shade-line token the data file omits (e.g. the
    // "RS" in "RS Sport Grey"). Anchored + word-bounded so it never eats a
    // real colour like "Russet".
    .replace(/^(?:rs|really\s*soft)\b\s*/, "")
  return s.replace(/[^a-z0-9]+/g, "")
}

/**
 * Dedup key for a CDN image URL — the trailing filename, lower-cased and
 * query-stripped. The BigCommerce filename carries a unique hash, so this
 * collapses the same image across size buckets (`605x755` vs `1280w`) and
 * `?c=1` cache-busters without colliding distinct images.
 */
export function normalizeImageUrlForDedup(url: string): string {
  const noQuery = (url ?? "").split("?")[0]!.trim()
  const file = noQuery.split("/").pop() ?? noQuery
  return file.toLowerCase()
}

/** /images/stencil/<bucket>/products/<pid>/<iid>/<file>.ext — single match. */
const STENCIL_PATH_RE =
  /\/images\/stencil\/\d+(?:w|x\d+)\/products\/(\d+)\/(\d+)\/([A-Za-z0-9_.\-]+\.(?:jpg|jpeg|png|webp))/i

/**
 * Parse a Gildan product page and return `colour-key → ordered CDN URLs`
 * (1280w bucket, query-stripped).
 *
 * Unlike `extractImageUrlsFromGildanHtml` (which keys by filename and only
 * resolves when the xlsx filename lines up with the CDN one), this reads
 * BigCommerce's own per-thumbnail `data-color-name="..."` swatch labels, so
 * it resolves images by COLOUR regardless of the filename scheme. This is
 * the ONLY way to get images for Gildan's youth styles (SF500B, 65000B,
 * 64000B), whose website filenames are keyed by colour CODE
 * (`SF500B_426_A1`, `65000B_533C_032_..._SD_F_...`) rather than colour name
 * — the filename path can never bridge "426" → "Black".
 *
 * Colour keys run through `normalizeGildanColourKey`. The hero/main gallery
 * image is labelled with the product title rather than a colour, so it keys
 * to a non-colour string and is harmlessly ignored by colour-name lookups.
 * Pure — accepts raw HTML so callers can unit-test against fixtures.
 */
export function extractColorImageMapFromGildanHtml(
  html: string
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!html) return out
  // Each gallery thumbnail is
  //   <div class="productView-thumbnail" data-color-name="X"> <a … href="<cdn>"> …
  // Splitting on the attribute scopes each segment to one thumbnail; the
  // thumbnail's OWN image is the one directly after the attribute. Bound the
  // search to a small window so a colour-picker swatch marker that carries
  // `data-color-name` but NO adjacent image can't sweep an unrelated colour's
  // photo from later in the gallery.
  const ADJACENT_IMG_WINDOW = 800
  const segments = html.split(/data-color-name="/i)
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    const close = seg.indexOf('"')
    if (close < 0) continue
    const key = normalizeGildanColourKey(seg.slice(0, close))
    if (!key) continue
    const window = seg.slice(close + 1, close + 1 + ADJACENT_IMG_WINDOW)
    const m = window.match(STENCIL_PATH_RE)
    if (!m) continue
    const url = `https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/${m[1]}/${m[2]}/${m[3]}`
    const arr = out.get(key)
    if (arr) {
      if (!arr.includes(url)) arr.push(url)
    } else {
      out.set(key, [url])
    }
  }
  return dropMislabelledColourImages(out)
}

/**
 * Guard against the supplier occasionally tagging a thumbnail with the wrong
 * colour. Observed on the AA 2PQ shorts page, where "arctic" swatches point at
 * `2PQ_HeatherGrey_*` files — trusting the label would put a grey photo on the
 * Arctic variant (a wrong-colour image is worse than none).
 *
 * Rule: drop an image whose filename clearly names a DIFFERENT colour swatch
 * present on the same page but NOT its own. Only fires for name-based
 * filenames (where a colour word is detectable); code-based filenames
 * (`2001Y_000C_…`) carry no colour word, so they're always kept. Keys shorter
 * than 4 chars (e.g. "red", "tan") are excluded as conflict signals to avoid
 * substring false positives.
 */
function dropMislabelledColourImages(
  map: Map<string, string[]>
): Map<string, string[]> {
  const conflictTokens = [...map.keys()].filter((k) => k.length >= 4)
  for (const [key, urls] of map) {
    const kept = urls.filter((url) => {
      const compact = normalizeImageUrlForDedup(url).replace(/[^a-z0-9]/g, "")
      if (compact.includes(key)) return true // filename names its own colour
      // names another swatch's colour but not its own → mislabelled, drop
      return !conflictTokens.some(
        (other) => other !== key && compact.includes(other)
      )
    })
    if (kept.length) map.set(key, kept)
    else map.delete(key)
  }
  return map
}

/**
 * Garment view (front / back / model) inferred from a Gildan image
 * URL/filename. Covers all three filename schemes the website ships:
 *   - adult name-based:  `_01` front, `_02` back, `_03..05` model/detail
 *   - youth hoodie:      `_A1` front, `_B1` back, `_C1` detail
 *   - youth tee (G2023): `_SD_F_` front, `_SD_B_` back
 */
export function gildanGarmentView(
  url: string
): "front" | "back" | "model" | "other" {
  const u = url.toLowerCase()
  if (/_a1[._]/.test(u) || /_sd_f_/.test(u) || /_01[._]/.test(u)) return "front"
  if (/_b1[._]/.test(u) || /_sd_b_/.test(u) || /_02[._]/.test(u)) return "back"
  if (/_c1[._]/.test(u) || /_0[345][._]/.test(u)) return "model"
  return "other"
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
  /**
   * Sitemap resolver — when set, the scraper resolves the live product
   * URL via the BigCommerce sitemap instead of trusting the (often
   * stale) URL in the xlsx column. Without a resolver the scraper
   * falls back to the passed `productUrl`, matching the old behaviour
   * for tests and legacy callers.
   */
  sitemapResolver?: GildanSitemapResolver | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type CacheRow = {
  scrapedAt: string
  urlByFilename: Record<string, string>
  /**
   * Colour-name → ordered CDN URLs, from the page's `data-color-name`
   * swatch labels. Added 2026-05 to support youth styles whose website
   * filenames are colour-CODE keyed (unbridgeable by `urlByFilename`).
   * Optional in the type only so legacy cache rows parse; `readCache`
   * treats its absence as stale and forces a re-fetch.
   */
  urlByColour?: Record<string, string[]>
}

/** Both lookup maps for a single style's images. */
export type GildanResolvedImages = {
  /** Filename-keyed (xlsx ↔ CDN). Primary path for adult name-based styles. */
  urlByFilename: Map<string, string>
  /** Colour-name-keyed (`data-color-name`). Fallback for youth code-named styles. */
  urlByColour: Map<string, string[]>
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
    // Empty maps mean the page rendered but our regex didn't match any
    // CDN URLs — typically because of a filename-format change. Treat
    // as a miss so a re-run picks up the fix instead of locking in the
    // empty result forever.
    if (Object.keys(parsed.urlByFilename).length === 0) return null
    // Legacy rows predate the colour map (and so locked youth styles to
    // their single name-based White image). Treat as stale so a re-run
    // repopulates `urlByColour`. Present-but-empty is a valid "page has no
    // swatch labels" result and is NOT re-fetched.
    if (!("urlByColour" in parsed)) return null
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
  private readonly sitemapResolver: GildanSitemapResolver | null
  /**
   * Stats — useful for the admin UI to surface what happened. Re-reset
   * between imports if you re-use the instance.
   */
  public stats = {
    cacheHits: 0,
    cacheMisses: 0,
    fetchErrors: 0,
    fetched: 0,
    sitemapResolved: 0,
    xlsxFallback: 0,
    urlUnresolved: 0,
  }

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
    this.sitemapResolver = opts.sitemapResolver ?? null
  }

  /**
   * Pick the live product URL for a style. When a sitemap resolver is
   * configured we look up the canonical URL there (preferred) and only
   * fall back to the xlsx URL if the style isn't in the sitemap
   * (typically a brand-new release).
   */
  private async resolveProductUrl(
    styleParent: string,
    xlsxUrl: string | null | undefined
  ): Promise<string | null> {
    if (this.sitemapResolver) {
      const sitemapUrl = await this.sitemapResolver.resolve(styleParent)
      if (sitemapUrl) {
        this.stats.sitemapResolved++
        return sitemapUrl
      }
    }
    if (xlsxUrl) {
      this.stats.xlsxFallback++
      return xlsxUrl
    }
    this.stats.urlUnresolved++
    return null
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
  }): Promise<GildanResolvedImages> {
    const { brand, styleParent, productUrl, filenames } = opts
    const empty: GildanResolvedImages = {
      urlByFilename: new Map(),
      urlByColour: new Map(),
    }

    const cacheFile = cachePathFor(this.cacheDir, brand, styleParent)
    let cached: CacheRow | null = null
    if (!this.noCache) cached = readCache(cacheFile)

    if (cached) {
      this.stats.cacheHits++
      return {
        urlByFilename: new Map(Object.entries(cached.urlByFilename)),
        urlByColour: new Map(Object.entries(cached.urlByColour ?? {})),
      }
    }

    this.stats.cacheMisses++
    const effectiveUrl = await this.resolveProductUrl(styleParent, productUrl)
    if (!effectiveUrl) {
      this.logger?.warn?.(
        `[gildan-image-scraper] no URL for ${brand}/${styleParent} (sitemap miss + no xlsx fallback)`
      )
      return empty
    }
    try {
      const maps = await this.fetchMaps(effectiveUrl)
      this.stats.fetched++
      if (!this.noCache) {
        writeCache(cacheFile, {
          scrapedAt: new Date().toISOString(),
          urlByFilename: Object.fromEntries(maps.urlByFilename),
          urlByColour: Object.fromEntries(maps.urlByColour),
        })
      }
      await sleep(this.delayMs)
      // The full per-style maps are returned with their normalised keys —
      // `buildGildanGarmentImages` re-normalises xlsx filenames / colour
      // names on lookup, so callers get a hit regardless of source form.
      // `filenames` is retained for API compat but no longer narrows the
      // result (the cache is already per-style — no cross-style collisions).
      void filenames
      return maps
    } catch (err: any) {
      this.stats.fetchErrors++
      this.logger?.warn?.(
        `[gildan-image-scraper] fetch failed for ${effectiveUrl}: ${err?.message ?? err}`
      )
      return empty
    }
  }

  /** Fetch a product page once and extract both the filename + colour maps. */
  private async fetchMaps(url: string): Promise<GildanResolvedImages> {
    const html = await this.fetchWithTimeout(url)
    return {
      urlByFilename: extractImageUrlsFromGildanHtml(html),
      urlByColour: extractColorImageMapFromGildanHtml(html),
    }
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
      const cacheFile = cachePathFor(this.cacheDir, s.brand, s.styleParent)
      if (!this.noCache && readCache(cacheFile)) {
        this.stats.cacheHits++
        continue
      }
      this.stats.cacheMisses++
      const effectiveUrl = await this.resolveProductUrl(
        s.styleParent,
        s.productUrl
      )
      if (!effectiveUrl) {
        this.logger?.warn?.(
          `[gildan-image-scraper] no URL for ${s.brand}/${s.styleParent} (sitemap miss + no xlsx fallback)`
        )
        continue
      }
      try {
        const maps = await this.fetchMaps(effectiveUrl)
        this.stats.fetched++
        if (!this.noCache) {
          writeCache(cacheFile, {
            scrapedAt: new Date().toISOString(),
            urlByFilename: Object.fromEntries(maps.urlByFilename),
            urlByColour: Object.fromEntries(maps.urlByColour),
          })
        }
        this.logger?.info?.(
          `[gildan-image-scraper] warmed ${s.brand}/${s.styleParent} (${maps.urlByFilename.size} filename URLs, ${maps.urlByColour.size} colours)`
        )
      } catch (err: any) {
        this.stats.fetchErrors++
        this.logger?.warn?.(
          `[gildan-image-scraper] fetch failed for ${effectiveUrl}: ${err?.message ?? err}`
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
