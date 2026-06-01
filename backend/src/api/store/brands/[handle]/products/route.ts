import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
  QueryContext,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { BRAND_MODULE } from "../../../../../modules/brand"
import type BrandModuleService from "../../../../../modules/brand/service"

const paramsSchema = z.object({ handle: z.string().min(1) })

const arrayString = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional()

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order: z.string().optional(),
  region_id: z.string().optional(),
  type_id: arrayString,
  tag_id: arrayString,
})

const STORE_PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "description",
  "handle",
  "is_giftcard",
  "discountable",
  "thumbnail",
  "collection_id",
  "type_id",
  "weight",
  "material",
  "created_at",
  "updated_at",
  "metadata",
  "type.*",
  "collection.*",
  "options.*",
  "options.values.*",
  "tags.*",
  "images.*",
  "variants.*",
  "variants.options.*",
  "variants.calculated_price.*",
  "variants.inventory_quantity",
  "variants.metadata",
  "variants.sku",
  "variants.weight",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "brand.*",
]

// In-memory TTL cache for the brand-products listing. This is the hot path on
// every brand page render and was costing ~1s per call (Medusa's query.graph
// pulls the full variant tree before the per-AP compaction strips it). A 60s
// TTL is safe — the storefront already caches its own call to this route for
// 120s (cacheLife on getBrandProducts), so an extra 60s of backend caching
// doesn't extend the visible staleness window. Stock/price changes from admin
// or the nightly importer take effect within ~3 min worst-case.
const BRAND_PRODUCTS_CACHE_TTL_MS = 60_000
const BRAND_PRODUCTS_CACHE_MAX = 500
const brandProductsCache = new Map<
  string,
  { body: unknown; expiresAt: number }
>()

function getCachedBrandProducts(key: string): unknown | undefined {
  const hit = brandProductsCache.get(key)
  if (!hit) return undefined
  if (Date.now() > hit.expiresAt) {
    brandProductsCache.delete(key)
    return undefined
  }
  // Re-insert to mark as most-recently-used. Map preserves insertion order,
  // so the oldest key is always at the head — cheap LRU semantics on eviction.
  brandProductsCache.delete(key)
  brandProductsCache.set(key, hit)
  return hit.body
}

function setCachedBrandProducts(key: string, body: unknown): void {
  brandProductsCache.set(key, {
    body,
    expiresAt: Date.now() + BRAND_PRODUCTS_CACHE_TTL_MS,
  })
  while (brandProductsCache.size > BRAND_PRODUCTS_CACHE_MAX) {
    const oldest = brandProductsCache.keys().next().value
    if (!oldest) break
    brandProductsCache.delete(oldest)
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { handle } = paramsSchema.parse(req.params ?? {})
  const q = querySchema.parse(req.query ?? {})

  const cacheKey = [
    handle,
    q.region_id ?? "",
    String(q.limit),
    String(q.offset),
    q.order ?? "",
    (q.type_id ?? []).join(","),
    (q.tag_id ?? []).join(","),
  ].join("|")

  const cached = getCachedBrandProducts(cacheKey)
  if (cached) {
    res.json(cached)
    return
  }

  const brandService = req.scope.resolve<BrandModuleService>(BRAND_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  const [brands] = await brandService.listAndCountBrands(
    { handle, is_active: true },
    { take: 1 }
  )
  const brand = brands[0]
  if (!brand) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Brand "${handle}" not found.`
    )
  }

  // Read product IDs from the Module Link table — single source of truth.
  // Drift is detected by `verify-brand-links` and repaired by
  // `relink-supplier-brands`, not silently papered over here.
  const linkRows: Array<{ product_id: string }> = await pgConnection(
    "product_product_brand_brand"
  )
    .where({ brand_id: brand.id })
    .whereNull("deleted_at")
    .select("product_id")

  const brandProductIds: string[] = linkRows
    .map((r) => r?.product_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  if (brandProductIds.length === 0) {
    res.json({
      products: [],
      count: 0,
      offset: q.offset,
      limit: q.limit,
    })
    return
  }

  const filters: Record<string, any> = {
    id: brandProductIds,
    status: ProductStatus.PUBLISHED,
  }
  if (q.type_id?.length) {
    filters.type_id = q.type_id
  }
  if (q.tag_id?.length) {
    filters.tags = { id: q.tag_id }
  }

  // Sales-channel scoping: passing
  //   filters.sales_channels = { id: salesChannelIds }
  // makes Medusa 2.x throw "Trying to query by not existing property
  // Product.sales_channels" because sales channels are a module link, not a
  // direct product property. The failing query crashed the route with a 500
  // on every brand-page render (observed 2026-05-25 in Fly logs — caught
  // by the storefront's getBrandProducts try/catch, so the UI silently
  // showed an empty product grid despite the brand-index page reporting
  // hundreds of products). Drop the filter for now; SC Prints runs a single
  // storefront / single sales channel so the brand-scoped product IDs are
  // already correctly bounded.
  // TODO: route sales-channel scoping through the link table once we run
  // more than one sales channel (mirror the brand_id resolution above).

  const context: Record<string, any> = {}
  if (q.region_id) {
    const regionRes = await query.graph({
      entity: "region",
      fields: ["id", "currency_code"],
      filters: { id: q.region_id },
      pagination: { take: 1, skip: 0 },
    })
    const region = (regionRes.data ?? [])[0]
    if (region) {
      context.variants = {
        calculated_price: QueryContext({
          region_id: region.id,
          currency_code: region.currency_code,
        }),
      }
    }
  }

  let orderConfig: Record<string, "ASC" | "DESC"> | undefined
  if (q.order) {
    const desc = q.order.startsWith("-")
    const field = desc ? q.order.slice(1) : q.order
    if (field) {
      orderConfig = { [field]: desc ? "DESC" : "ASC" }
    }
  }

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: STORE_PRODUCT_FIELDS,
    filters,
    pagination: {
      take: q.limit,
      skip: q.offset,
      ...(orderConfig ? { order: orderConfig } : {}),
    },
    context,
  })

  // AP products explode in two ways that make brand-listing pages clunky:
  //  1) They store ~60 images at the product level (the AP API nests images per
  //     variant). Listing cards don't render product.images — they read
  //     variant.metadata.garment_images.front for the swatch hover preview.
  //  2) They have 150–250 variants per style (~30 colours × ~5–8 sizes), and
  //     the listing card only needs (a) one variant per colour to look up the
  //     swatch image and (b) the cheapest variant to derive the "From $X" /
  //     "100+ $X" lines. Shipping every size variant for every colour bloats
  //     the JSON by ~10× and forces the client to hydrate/parse all of it.
  //  3) variant.metadata.garment_images carries front/back/model_image/all —
  //     the listing only needs `front`; the gallery uses a different route.
  // PDP traffic is unaffected — that route doesn't go through here.
  const trimmedProducts = (products ?? []).map((p: any) => {
    if (p.metadata?.source === "aussiepacific") {
      const compacted = compactAussiePacificProductForListing(p)
      // If the product has a precomputed listing_summary, the storefront's
      // card fast-path reads it directly and doesn't iterate variants at all
      // — so we can drop the variant array from the response entirely. Cuts
      // payload roughly in half on top of the per-colour compaction.
      // Products without the summary fall back to the compacted variants
      // (the storefront's variant-iteration path still works).
      if (p.metadata?.listing_summary) {
        return { ...compacted, variants: [] }
      }
      return compacted
    }
    return p
  })

  const responseBody = {
    products: trimmedProducts,
    count: metadata?.count ?? 0,
    offset: q.offset,
    limit: q.limit,
  }
  setCachedBrandProducts(cacheKey, responseBody)
  res.json(responseBody)
}

const COLOR_OPTION_MATCHER = /(color|colour|shade)/i

type VariantLike = {
  options?: Array<{ option_id?: string; value?: string }> | null
  calculated_price?: { calculated_amount?: number | null } | null
  metadata?: Record<string, unknown> | null
}

type ProductLike = {
  metadata?: Record<string, any> | null
  options?: Array<{ id?: string; title?: string | null }> | null
  variants?: VariantLike[] | null
  [key: string]: unknown
}

const cheapestFirst = (variants: VariantLike[]): VariantLike[] =>
  [...variants].sort((a, b) => {
    const am = a.calculated_price?.calculated_amount ?? Number.POSITIVE_INFINITY
    const bm = b.calculated_price?.calculated_amount ?? Number.POSITIVE_INFINITY
    return am - bm
  })

function compactAussiePacificProductForListing(p: ProductLike): ProductLike {
  const variants = p.variants ?? []
  const colorOption = (p.options ?? []).find(
    (o) => typeof o.title === "string" && COLOR_OPTION_MATCHER.test(o.title)
  )
  const colorOptionId = colorOption?.id

  let compactedVariants: VariantLike[]
  if (!colorOptionId || variants.length <= 1) {
    compactedVariants = cheapestFirst(variants).slice(0, 1)
  } else {
    const byColor = new Map<string, VariantLike[]>()
    const noColor: VariantLike[] = []
    for (const v of variants) {
      const raw = (v.options ?? []).find(
        (ov) => ov.option_id === colorOptionId
      )?.value
      const key = typeof raw === "string" ? raw.trim() : ""
      if (!key) {
        noColor.push(v)
        continue
      }
      const arr = byColor.get(key) ?? []
      arr.push(v)
      byColor.set(key, arr)
    }
    compactedVariants = []
    for (const group of byColor.values()) {
      const cheapest = cheapestFirst(group)[0]
      if (cheapest) compactedVariants.push(cheapest)
    }
    if (noColor.length) {
      const cheapestNoColor = cheapestFirst(noColor)[0]
      if (cheapestNoColor) compactedVariants.push(cheapestNoColor)
    }
  }

  const trimmedVariants = compactedVariants.map((v) => {
    const meta = (v.metadata ?? {}) as Record<string, unknown>
    const gi = meta.garment_images as { front?: unknown } | undefined
    if (!gi || typeof gi !== "object") {
      return v
    }
    const front = typeof gi.front === "string" ? gi.front : undefined
    return {
      ...v,
      metadata: {
        ...meta,
        garment_images: front ? { front } : {},
      },
    }
  })

  return { ...p, images: [], variants: trimmedVariants }
}
