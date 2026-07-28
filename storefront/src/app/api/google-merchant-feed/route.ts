import { HttpTypes } from "@medusajs/types"
import { connection } from "next/server"

import { getProductsList } from "@lib/data/products"
import { getBaseURL } from "@lib/util/env"
import { getProductPrice } from "@lib/util/get-product-price"
import { SEO } from "@lib/util/seo"
import { garmentUrlViewRank } from "@modules/products/lib/variant-options"

/**
 * Google Merchant Center product feed (RSS 2.0 / Google Shopping spec).
 *
 * Merchant Center pulls this URL on a schedule — there is no push, no OAuth and
 * no Content API client to maintain. Register it under
 * Merchant Center → Data sources → Add product source → scheduled fetch.
 *
 * Lives under `/api/` deliberately: `middleware.ts` country-prefixes and 307s
 * anything it matches, and `/api` is already excluded. A prettier
 * `/feeds/products.xml` would need a new exclusion in that matcher regex —
 * the same regex that has already broken robots.txt and sitemap.xml once each.
 * Merchant Center does not care about the extension.
 *
 * ponytail: PRODUCT-level feed (~1400 items), not variant-level (~62k). Google
 * only *requires* color/size/age_group/gender for apparel feeds targeting
 * BR/FR/DE/JP/UK/US — AU is not on that list, so one item per product is
 * compliant here and keeps the feed two orders of magnitude smaller. If SC
 * Prints ever targets those countries, this has to become variant-level with
 * `item_group_id` grouping the variants of a product.
 */

/** ~130s cold catalog walk; Vercel's default function cap would clip it. */
export const maxDuration = 300

const COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_REGION || "au"

/** Apparel & Accessories > Clothing. Google auto-assigns when omitted, but
 *  stating it avoids mis-categorised bids on a mixed catalog. */
const GOOGLE_PRODUCT_CATEGORY = "Apparel & Accessories > Clothing"

const PAGE_SIZE = 100
/** Runaway guard, mirroring listAllProductHandles(). */
const MAX_PRODUCTS = 20000
/** Google caps additional images at 10. */
const MAX_ADDITIONAL_IMAGES = 10

/**
 * Handles that exist as Medusa products but aren't shoppable SKUs — tools,
 * configurators and paid services. Shopping ads for these get disapproved
 * ("not a product") and would bid against the real catalog.
 *
 * ponytail: explicit denylist, not an inferred rule. There are only a handful
 * and they're stable; a tag-based convention would have to be applied by staff
 * to be reliable, and isn't today.
 */
const EXCLUDED_HANDLES = new Set(["dtf-auto-builder"])

/**
 * Escape text for XML. Supplier-imported titles and descriptions routinely
 * contain `&` and stray angle brackets; unescaped they produce a malformed
 * feed and Merchant Center rejects the entire fetch, not just the bad item.
 */
const xml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Strip control chars — invalid in XML 1.0 and present in some feeds.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")

/**
 * Decode HTML entities already present in the source text. Descriptions written
 * in the admin's rich-text editor (and some supplier imports) arrive containing
 * `&apos;` / `&amp;` literally; without decoding first, `xml()` escapes the
 * ampersand again and the feed renders a visible `&amp;apos;` to shoppers.
 * `&amp;` is decoded LAST so `&amp;lt;` doesn't collapse two levels at once.
 */
const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")

/** Plain-text description, HTML stripped, within Google's 5000-char limit. */
const toDescription = (product: HttpTypes.StoreProduct): string => {
  const raw = product.description || product.title || ""
  const clean = decodeEntities(String(raw))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return (clean || product.title || "").slice(0, 5000)
}

/**
 * A product is in stock if ANY variant is orderable. Variants that don't manage
 * inventory (Gildan, Shaka Wear — no supplier stock feed) or that allow
 * backorder are always orderable.
 */
const isInStock = (product: HttpTypes.StoreProduct): boolean =>
  (product.variants ?? []).some((v: any) => {
    if (v?.manage_inventory === false) return true
    if (v?.allow_backorder === true) return true
    return Number(v?.inventory_quantity ?? 0) > 0
  })

const buildItem = (product: HttpTypes.StoreProduct, baseUrl: string): string | null => {
  if (!product.handle || EXCLUDED_HANDLES.has(product.handle)) return null

  // Price must match what the PDP shows or Merchant Center disapproves the item,
  // so this uses the same helper the listing tile and PDP use.
  const { cheapestPrice } = getProductPrice({ product })
  if (!cheapestPrice?.display_unit_minor) return null
  // NOT a typo and NOT a missing /100: despite the `_minor` suffix,
  // `display_unit_minor` is MAJOR units (decimal dollars) — see the header
  // comment in lib/util/resolve-display-minor.ts. The suffix is legacy, kept
  // so existing imports still compile. Dividing by 100 here shipped a feed
  // where every garment was priced at ~$0.25.
  const priceMajor = cheapestPrice.display_unit_minor.toFixed(2)
  const currency = (cheapestPrice.currency_code || "aud").toUpperCase()

  const link = new URL(
    `/${COUNTRY_CODE}/products/${product.handle}`,
    baseUrl
  ).toString()

  // CLAUDE.md hard rule: never pick a garment image by array position —
  // repair/scrape scripts append and reorder freely, which is how back shots
  // ended up rendering as fronts before. Rank the thumbnail alongside the
  // gallery and lead with the best front view; `g:image_link` is the photo
  // Google actually shows in the ad.
  const rankedImages = [
    product.thumbnail,
    ...(product.images ?? []).map((i) => i?.url),
  ]
    .filter((url): url is string => Boolean(url))
    .filter((url, index, all) => all.indexOf(url) === index)
    .map((url, index) => ({ url, index, rank: garmentUrlViewRank(url) }))
    // Stable: rank first, original order as the tiebreak.
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.url)

  const primaryImage = rankedImages[0]
  if (!primaryImage) return null // image_link is required

  const additionalImages = rankedImages
    .slice(1)
    .slice(0, MAX_ADDITIONAL_IMAGES)

  const brand = (product as any).brand?.name || SEO.siteName
  const productType = product.type?.value

  return [
    "    <item>",
    `      <g:id>${xml(product.id)}</g:id>`,
    `      <g:title>${xml(product.title)}</g:title>`,
    `      <g:description>${xml(toDescription(product))}</g:description>`,
    `      <g:link>${xml(link)}</g:link>`,
    `      <g:image_link>${xml(primaryImage)}</g:image_link>`,
    ...additionalImages.map(
      (url) => `      <g:additional_image_link>${xml(url)}</g:additional_image_link>`
    ),
    `      <g:availability>${isInStock(product) ? "in_stock" : "out_of_stock"}</g:availability>`,
    `      <g:price>${priceMajor} ${currency}</g:price>`,
    `      <g:brand>${xml(brand)}</g:brand>`,
    "      <g:condition>new</g:condition>",
    // Custom-printed apparel has no manufacturer barcode. Without this Google
    // warns on every item for the missing GTIN/MPN pair.
    "      <g:identifier_exists>no</g:identifier_exists>",
    `      <g:google_product_category>${xml(GOOGLE_PRODUCT_CATEGORY)}</g:google_product_category>`,
    ...(productType ? [`      <g:product_type>${xml(productType)}</g:product_type>`] : []),
    "    </item>",
  ].join("\n")
}

/**
 * Stop walking and emit what we have once this much wall-clock has passed.
 * Well under `maxDuration` so there's room to serialise and respond.
 */
const WALK_BUDGET_MS = 120_000

export async function GET() {
  const startedAt = Date.now()

  // Build-time prerender is fatal here: Next statically evaluates route
  // handlers during `next build` and Vercel caps that at 60s per route, but a
  // full catalog walk takes ~130s — the export failed 3× and killed the deploy.
  // `connection()` marks this request-time (the segment config `dynamic` is
  // rejected under nextConfig.cacheComponents). Freshness and cost stay with
  // the layers that own them: getProductsList is `"use cache"` tagged
  // "products", and the response carries s-maxage=3600 for the CDN.
  await connection()

  const baseUrl = getBaseURL()
  const items: string[] = []

  // Page 1 first — its `count` tells us how many pages exist so the rest can
  // be fetched concurrently. Walking all ~12 pages sequentially took ~123s and
  // then blew the 300s ceiling entirely, which is why Merchant Center imported
  // 0 products: it was fetching a timed-out error page, not a feed.
  //
  // getProductsList is `"use cache"` (tagged "products", invalidated by the
  // backend revalidate hook), so warm instances skip the backend entirely.
  // Partial-failure tolerant: a page that throws is dropped rather than
  // failing the whole feed.
  const fetchPage = async (page: number) => {
    try {
      const { response } = await getProductsList({
        pageParam: page,
        queryParams: { limit: PAGE_SIZE },
        countryCode: COUNTRY_CODE,
      })
      return response
    } catch (error) {
      console.error(
        `[google-merchant-feed] page ${page} failed`,
        (error as Error).message
      )
      return { products: [] as HttpTypes.StoreProduct[], count: 0 }
    }
  }

  const collect = (products: HttpTypes.StoreProduct[]) => {
    for (const product of products) {
      const item = buildItem(product, baseUrl)
      if (item) items.push(item)
    }
  }

  const first = await fetchPage(1)
  collect(first.products)

  const totalPages = Math.min(
    Math.ceil((first.count || 0) / PAGE_SIZE),
    Math.ceil(MAX_PRODUCTS / PAGE_SIZE)
  )

  // ponytail: fixed concurrency of 6 — a page of 100 products takes ~6s from
  // the backend, so 14 pages collapse from ~84s sequential into ~3 waves
  // (~20s) without stampeding Medusa. Raise only if the backend is
  // demonstrably idle during the fetch.
  const CONCURRENCY = 6
  for (let start = 2; start <= totalPages; start += CONCURRENCY) {
    // Emit a partial feed rather than nothing if the backend turns slow. The
    // first deploy of this route blew maxDuration entirely and Merchant Center
    // imported 0 products from the resulting error page — a short feed is far
    // better than a timeout, and Google keeps prior items it doesn't see again
    // within its grace window.
    if (Date.now() - startedAt > WALK_BUDGET_MS) {
      console.warn(
        `[google-merchant-feed] walk budget hit after page ${start - 1}/${totalPages}; emitting ${items.length} items`
      )
      break
    }

    const batch = []
    for (let page = start; page < start + CONCURRENCY && page <= totalPages; page++) {
      batch.push(fetchPage(page))
    }
    const results = await Promise.all(batch)
    for (const result of results) collect(result.products)
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${xml(SEO.siteName)}</title>`,
    `    <link>${xml(baseUrl)}</link>`,
    `    <description>${xml(SEO.siteDescription)}</description>`,
    ...items,
    "  </channel>",
    "</rss>",
  ].join("\n")

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Merchant Center fetches at most daily; an hour of edge cache keeps
      // repeat/manual fetches off the backend without going stale.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
