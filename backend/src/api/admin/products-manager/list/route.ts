import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

/**
 * POST /admin/products-manager/list
 *
 * Rich filter + paginated list backing the "Browse & manage" tab in
 * /app/product-data. POST (not GET) because the filter body is large
 * — multi-selects + a checkbox group of data-quality flags.
 *
 * The list joins through every signal the data-quality dots render:
 * thumbnail, description, type, tags, brand link, sales channels,
 * categories. "Missing X" filters are applied as a post-filter in JS
 * because the underlying relation-null queries don't compose cleanly
 * with query.graph's filter syntax. Catalog size (~few thousand) keeps
 * that cheap; if it grows past tens of thousands, promote to explicit
 * SQL.
 */

const QualityFlag = z.enum([
  "image",
  "description",
  "type",
  "tags",
  "brand",
  "sales_channel",
  "shop_category",
])

const ProductStatus = z.enum(["draft", "published", "proposed", "rejected"])

const bodySchema = z.object({
  status: z.array(ProductStatus).optional(),
  brand_ids: z.array(z.string().min(1)).optional(),
  type_ids: z.array(z.string().min(1)).optional(),
  tag_ids: z.array(z.string().min(1)).optional(),
  category_ids: z.array(z.string().min(1)).optional(),
  collection_ids: z.array(z.string().min(1)).optional(),
  sales_channel_ids: z.array(z.string().min(1)).optional(),
  created_from: z.string().optional(),
  created_to: z.string().optional(),
  q: z.string().optional(),
  missing: z.array(QualityFlag).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  order: z
    .enum([
      "title",
      "-title",
      "created_at",
      "-created_at",
      "status",
      "-status",
    ])
    .optional(),
  /** When true, return up to `ids_limit` ids only (no pagination, no quality post-filter pagination). Used by "Select all matching filter". */
  ids_only: z.boolean().optional(),
  ids_limit: z.number().int().min(1).max(1000).optional(),
})

type QueryLike = {
  graph: (a: Record<string, unknown>) => Promise<{ data?: any[] }>
}

type RawBrand = { id?: string; name?: string; handle?: string }
type RawProduct = {
  id: string
  title?: string | null
  handle?: string | null
  thumbnail?: string | null
  status?: string | null
  description?: string | null
  created_at?: string | null
  variants?: Array<{ id: string }> | null
  type?: { id?: string; value?: string } | null
  tags?: Array<{ id: string; value: string }> | null
  categories?: Array<{ id: string; name?: string }> | null
  collection?: { id?: string; handle?: string; title?: string } | null
  sales_channels?: Array<{ id: string; name?: string }> | null
  brand?: RawBrand | RawBrand[] | null
}

const FIELDS = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "status",
  "description",
  "created_at",
  "variants.id",
  "type.id",
  "type.value",
  "tags.id",
  "tags.value",
  "categories.id",
  "categories.name",
  "collection.id",
  "collection.handle",
  "collection.title",
  "sales_channels.id",
  "sales_channels.name",
  "brand.id",
  "brand.name",
  "brand.handle",
] as const

// Minimal field set for the quality-detection pass and ids_only requests.
// Drops `.name` / `.value` / `.handle` on relations — the post-filter only
// needs to know whether each relation has at least one row, and ids_only
// callers throw the rows away after collecting `id`. Pulling just the
// relation `.id` columns lets the Mikro-ORM joiner skip the wider hydration
// path on M2M relations (tags / categories / sales_channels) and on the
// Brand module link.
const LIGHT_FIELDS = [
  "id",
  "title",
  "status",
  "thumbnail",
  "description",
  "created_at",
  "type.id",
  "tags.id",
  "categories.id",
  "sales_channels.id",
  "brand.id",
] as const

function readBrand(p: RawProduct): { id: string; name: string | null; handle: string | null } | null {
  if (!p.brand) return null
  const raw = Array.isArray(p.brand) ? p.brand[0] : p.brand
  if (!raw?.id) return null
  return { id: raw.id, name: raw.name ?? null, handle: raw.handle ?? null }
}

function computeQuality(p: RawProduct) {
  const brand = readBrand(p)
  const desc = typeof p.description === "string" ? p.description.trim() : ""
  const thumb = typeof p.thumbnail === "string" ? p.thumbnail.trim() : ""
  return {
    has_image: thumb.length > 0,
    has_description: desc.length > 0,
    has_type: !!p.type?.id,
    has_tags: Array.isArray(p.tags) && p.tags.length > 0,
    has_brand: !!brand,
    has_sales_channel:
      Array.isArray(p.sales_channels) && p.sales_channels.length > 0,
    has_shop_category:
      Array.isArray(p.categories) && p.categories.length > 0,
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const query = req.scope.resolve<QueryLike>(ContainerRegistrationKeys.QUERY)

  // Build filters that query.graph understands directly.
  const filters: Record<string, unknown> = {}
  if (body.status?.length) filters.status = body.status
  if (body.type_ids?.length) filters.type_id = body.type_ids
  if (body.collection_ids?.length) filters.collection_id = body.collection_ids
  if (body.tag_ids?.length) filters.tags = { id: body.tag_ids }
  if (body.category_ids?.length) filters.categories = { id: body.category_ids }
  if (body.sales_channel_ids?.length)
    filters.sales_channels = { id: body.sales_channel_ids }

  // Brand is a Module Link (not a core Product property), so
  // `filters.brand` throws "Trying to query by not existing property
  // Product.brand". Resolve the brand → products link first and turn
  // the result into an explicit `id IN (...)` filter on the main query.
  if (body.brand_ids?.length) {
    try {
      const { data: brandRows = [] } = await query.graph({
        entity: "brand",
        fields: ["id", "products.id"],
        filters: { id: body.brand_ids },
        pagination: { take: body.brand_ids.length, skip: 0 },
      })
      const ids = new Set<string>()
      for (const b of brandRows as any[]) {
        const products = Array.isArray(b?.products) ? b.products : []
        for (const p of products) if (p?.id) ids.add(p.id)
      }
      if (ids.size === 0) {
        res.json({
          products: [],
          count: 0,
          limit: body.limit ?? 50,
          offset: body.offset ?? 0,
          truncated: false,
        })
        return
      }
      filters.id = [...ids]
    } catch (err: any) {
      res.status(500).json({
        message: `brand filter resolution failed: ${err?.message ?? err}`,
      })
      return
    }
  }

  if (body.q?.trim()) {
    // Search across BOTH title and handle. Handle matters for SC Prints
    // because supplier prefixes (e.g. `ramo-f303hzw`, `as-colour-5650`)
    // only ever appear in the handle, never the title. Two parallel
    // ilike queries unioned via product IDs — query.graph in this
    // Medusa version doesn't reliably accept $or on Product. Bounded
    // at 5000 IDs each so a degenerate search ("%a%") still returns in
    // reasonable time.
    const q = body.q.trim().replace(/[%_]/g, "")
    try {
      const [byTitle, byHandle] = await Promise.all([
        query.graph({
          entity: "product",
          fields: ["id"],
          filters: { title: { $ilike: `%${q}%` } },
          pagination: { take: 5000, skip: 0 },
        }),
        query.graph({
          entity: "product",
          fields: ["id"],
          filters: { handle: { $ilike: `%${q}%` } },
          pagination: { take: 5000, skip: 0 },
        }),
      ])
      const matchedIds = new Set<string>()
      for (const p of (byTitle.data as any[]) ?? []) if (p?.id) matchedIds.add(p.id)
      for (const p of (byHandle.data as any[]) ?? []) if (p?.id) matchedIds.add(p.id)
      if (matchedIds.size === 0) {
        res.json({
          products: [],
          count: 0,
          limit: body.limit ?? 50,
          offset: body.offset ?? 0,
          truncated: false,
        })
        return
      }
      // Intersect with any id filter already set (e.g. by the brand
      // pre-fetch above). When both are set, we want products that
      // satisfy BOTH constraints.
      if (Array.isArray(filters.id)) {
        const existing = new Set(filters.id as string[])
        const intersection = [...matchedIds].filter((id) => existing.has(id))
        if (intersection.length === 0) {
          res.json({
            products: [],
            count: 0,
            limit: body.limit ?? 50,
            offset: body.offset ?? 0,
            truncated: false,
          })
          return
        }
        filters.id = intersection
      } else {
        filters.id = [...matchedIds]
      }
    } catch (err: any) {
      res.status(500).json({
        message: `search resolution failed: ${err?.message ?? err}`,
      })
      return
    }
  }
  if (body.created_from || body.created_to) {
    const range: Record<string, string> = {}
    if (body.created_from) range.$gte = body.created_from
    if (body.created_to) range.$lte = body.created_to
    filters.created_at = range
  }

  // Sort: query.graph expects { field: "ASC" | "DESC" }
  const orderRaw = body.order ?? "-created_at"
  const field = orderRaw.replace(/^-/, "")
  const direction: "ASC" | "DESC" = orderRaw.startsWith("-") ? "DESC" : "ASC"

  const idsOnly = !!body.ids_only
  const idsLimit = body.ids_limit ?? 1000
  const hasQualityFilter = !!body.missing?.length
  const limit = body.limit ?? 50
  const offset = body.offset ?? 0

  // ── Two-pass strategy when a data-quality filter ("Missing X") is set ──
  //
  // The flag asks for products with a NULL/empty relation (no tags, no
  // brand, no sales-channel, etc.) — query.graph can't express that as
  // a SQL-level filter, so we have to fetch and post-filter in JS. The
  // single-pass version pulled the full FIELDS set (7 fat relations
  // including .name / .value) for up to 600 rows on every filter change,
  // which was what dragged the page out to minutes for big brands.
  //
  //   Pass 1 — LIGHT_FIELDS (id + minimal relation IDs) on up to 600
  //            rows. Enough to compute missing-X, sort, and slice to the
  //            visible page.
  //   Pass 2 — full FIELDS limited to the visible page's IDs (≤ pageSize,
  //            i.e. 25-200). Tiny join cost compared to a 600-row fetch.
  //
  // The other two paths (no quality filter, ids_only) keep their existing
  // single-pass behaviour because they don't need the over-fetch.
  if (hasQualityFilter) {
    const lightTake = idsOnly ? Math.min(idsLimit, 1000) : 600
    let lightRows: RawProduct[] = []
    try {
      const { data } = (await query.graph({
        entity: "product",
        fields: LIGHT_FIELDS as unknown as string[],
        filters,
        pagination: {
          take: lightTake,
          skip: 0,
          order: { [field]: direction },
        },
      })) as { data?: any[] }
      lightRows = (data as RawProduct[]) ?? []
    } catch (err: any) {
      res.status(500).json({
        message: `products-manager list (pass 1) failed: ${err?.message ?? err}`,
      })
      return
    }

    const flags = new Set(body.missing!)
    const filtered = lightRows.filter((p) => {
      const q = computeQuality(p)
      if (flags.has("image") && q.has_image) return false
      if (flags.has("description") && q.has_description) return false
      if (flags.has("type") && q.has_type) return false
      if (flags.has("tags") && q.has_tags) return false
      if (flags.has("brand") && q.has_brand) return false
      if (flags.has("sales_channel") && q.has_sales_channel) return false
      if (flags.has("shop_category") && q.has_shop_category) return false
      return true
    })
    const truncated = lightRows.length >= lightTake

    if (idsOnly) {
      res.json({
        ids: filtered.slice(0, idsLimit).map((p) => p.id),
        count: filtered.length,
        truncated,
      })
      return
    }

    const pageIds = filtered.slice(offset, offset + limit).map((p) => p.id)
    if (pageIds.length === 0) {
      res.json({
        products: [],
        count: filtered.length,
        limit,
        offset,
        truncated,
      })
      return
    }

    let fullRows: RawProduct[] = []
    try {
      const { data } = (await query.graph({
        entity: "product",
        fields: FIELDS as unknown as string[],
        filters: { id: pageIds },
        pagination: { take: pageIds.length, skip: 0 },
      })) as { data?: any[] }
      fullRows = (data as RawProduct[]) ?? []
    } catch (err: any) {
      res.status(500).json({
        message: `products-manager list (pass 2) failed: ${err?.message ?? err}`,
      })
      return
    }

    // `filters.id = [...]` doesn't preserve list order — re-stitch
    // pass-2 rows in the sort order pass-1 produced.
    const byId = new Map<string, RawProduct>()
    for (const row of fullRows) byId.set(row.id, row)
    const ordered: RawProduct[] = []
    for (const id of pageIds) {
      const row = byId.get(id)
      if (row) ordered.push(row)
    }

    res.json({
      products: ordered.map(toProductResponse),
      count: filtered.length,
      limit,
      offset,
      truncated,
    })
    return
  }

  // ── Single-pass DB-paginated path (no quality filter) ──
  const underlyingTake = idsOnly ? Math.min(idsLimit, 1000) : limit
  const underlyingSkip = idsOnly ? 0 : offset

  let raw: RawProduct[] = []
  let dbCount: number | null = null
  try {
    const { data, metadata } = (await query.graph({
      entity: "product",
      fields: idsOnly
        ? (LIGHT_FIELDS as unknown as string[])
        : (FIELDS as unknown as string[]),
      filters,
      pagination: {
        take: underlyingTake,
        skip: underlyingSkip,
        order: { [field]: direction },
      },
    })) as { data?: any[]; metadata?: { count?: number } }
    raw = (data as RawProduct[]) ?? []
    if (typeof metadata?.count === "number") dbCount = metadata.count
  } catch (err: any) {
    res.status(500).json({
      message: `products-manager list query failed: ${err?.message ?? err}`,
    })
    return
  }

  if (idsOnly) {
    res.json({
      ids: raw.slice(0, idsLimit).map((p) => p.id),
      count: dbCount ?? raw.length,
      truncated: false,
    })
    return
  }

  // If we DB-paginated and Medusa didn't hand us metadata.count, run a
  // cheap id-only count query: same filters, no relations.
  if (dbCount === null) {
    try {
      const { data: countData } = await query.graph({
        entity: "product",
        fields: ["id"],
        filters,
        pagination: { take: 10000, skip: 0 },
      })
      dbCount = ((countData as any[]) ?? []).length
    } catch {
      dbCount = null
    }
  }

  res.json({
    products: raw.map(toProductResponse),
    count: dbCount ?? raw.length + underlyingSkip,
    limit,
    offset,
    truncated: false,
  })
}

function toProductResponse(p: RawProduct) {
  const brand = readBrand(p)
  const variantCount = Array.isArray(p.variants) ? p.variants.length : 0
  const tags = Array.isArray(p.tags) ? p.tags : []
  const categories = Array.isArray(p.categories) ? p.categories : []
  const salesChannels = Array.isArray(p.sales_channels) ? p.sales_channels : []
  return {
    id: p.id,
    title: p.title ?? null,
    handle: p.handle ?? null,
    thumbnail: p.thumbnail ?? null,
    status: p.status ?? null,
    created_at: p.created_at ?? null,
    variant_count: variantCount,
    type: p.type?.id ? { id: p.type.id, value: p.type.value ?? null } : null,
    tags: tags.map((t) => ({ id: t.id, value: t.value })),
    category_count: categories.length,
    category_ids: categories.map((c) => c.id),
    collection: p.collection?.id
      ? {
          id: p.collection.id,
          handle: p.collection.handle ?? null,
          title: p.collection.title ?? null,
        }
      : null,
    sales_channel_count: salesChannels.length,
    sales_channels: salesChannels.map((s) => ({
      id: s.id,
      name: s.name ?? null,
    })),
    brand,
    quality: computeQuality(p),
  }
}
