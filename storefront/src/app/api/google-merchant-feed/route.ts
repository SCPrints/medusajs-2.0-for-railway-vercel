import { HttpTypes } from "@medusajs/types"

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

export async function GET() {
  const baseUrl = getBaseURL()
  const items: string[] = []

  // Walk the catalog page by page. getProductsList is `"use cache"` with
  // cacheTag("products"), so this reuses whatever the storefront already
  // cached and is invalidated by the existing backend revalidate hook.
  // Partial-failure tolerant: a mid-walk backend blip yields a shorter feed
  // rather than a 500 — Merchant Center treats a failed fetch as "keep the
  // previous feed", but a short feed is still better than no refresh.
  try {
    for (let page = 1; items.length < MAX_PRODUCTS; page++) {
      const { response, nextPage } = await getProductsList({
        pageParam: page,
        queryParams: { limit: PAGE_SIZE },
        countryCode: COUNTRY_CODE,
      })

      for (const product of response.products) {
        const item = buildItem(product, baseUrl)
        if (item) items.push(item)
      }

      if (!nextPage || response.products.length === 0) break
    }
  } catch (error) {
    console.error(
      "[google-merchant-feed] catalog walk failed",
      (error as Error).message
    )
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
