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
 * categories. query.graph's filter syntax can't ask for a missing
 * relation, so the "Missing X" filters run in SQL (`missingProductsQuery`).
 */

const QualityFlag = z.enum([
  "image",
  "broken_image",
  "below_cost",
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
  metadata?: Record<string, any> | null
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
  "metadata",
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
  // Set by the image-audit scan ([services/image-audit]): the thumbnail
  // field is populated but the URL HEAD-checks dead. Distinct from
  // has_image (which only knows the field is non-empty).
  const brokenImage = p.metadata?.image_audit?.status === "broken"
  // Set by the below-cost pricing audit ([scripts/audit-below-cost-pricing]):
  // some variant's bulk_pricing 100+ tier sits below its cash cost — the
  // signature of the 2026-08 DNC cost-as-retail inversion.
  const belowCost = p.metadata?.pricing_audit?.status === "below_cost"
  return {
    has_image: thumb.length > 0,
    broken_image: brokenImage,
    below_cost: belowCost,
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

/**
 * Each data-quality flag as a SQL condition on `product p`: the same answers
 * as computeQuality. Soft-deleted relations and link rows don't count, as
 * with query.graph. "broken_image" and "below_cost" keep products the audits
 * flagged; the rest keep products missing that signal.
 */
const MISSING_SQL: Record<z.infer<typeof QualityFlag>, string> = {
  image: `not coalesce(p.thumbnail ~ '\\S', false)`,
  broken_image: `coalesce(p.metadata->'image_audit'->>'status' = 'broken', false)`,
  below_cost: `coalesce(p.metadata->'pricing_audit'->>'status' = 'below_cost', false)`,
  description: `not coalesce(p.description ~ '\\S', false)`,
  type: `not exists (select 1 from product_type t where t.id = p.type_id and t.deleted_at is null)`,
  tags: `not exists (select 1 from product_tags x
           join product_tag t on t.id = x.product_tag_id and t.deleted_at is null
          where x.product_id = p.id)`,
  brand: `not exists (select 1 from product_product_brand_brand l
            join brand b on b.id = l.brand_id and b.deleted_at is null
           where l.product_id = p.id and l.deleted_at is null)`,
  sales_channel: `not exists (select 1 from product_sales_channel l
                    join sales_channel s on s.id = l.sales_channel_id and s.deleted_at is null
                   where l.product_id = p.id and l.deleted_at is null)`,
  shop_category: `not exists (select 1 from product_category_product x
                    join product_category c on c.id = x.product_category_id and c.deleted_at is null
                   where x.product_id = p.id)`,
}

/**
 * The products the body's filters match (`ids`: the brand / sales channel /
 * search lookups already resolved) that have every ticked flag, as a knex
 * query on `product p`. The same filters the query.graph path applies.
 */
function missingProductsQuery(pg: any, body: z.infer<typeof bodySchema>, ids?: string[]) {
  const q = pg("product as p").whereNull("p.deleted_at")
  if (body.status?.length) q.whereIn("p.status", body.status)
  if (body.type_ids?.length) q.whereIn("p.type_id", body.type_ids)
  if (body.collection_ids?.length) q.whereIn("p.collection_id", body.collection_ids)
  if (body.tag_ids?.length) {
    q.whereRaw(
      `exists (select 1 from product_tags x where x.product_id = p.id and x.product_tag_id = any(?::text[]))`,
      [body.tag_ids]
    )
  }
  if (body.category_ids?.length) {
    q.whereRaw(
      `exists (select 1 from product_category_product x
                where x.product_id = p.id and x.product_category_id = any(?::text[]))`,
      [body.category_ids]
    )
  }
  if (ids) q.whereRaw(`p.id = any(?::text[])`, [ids])
  if (body.created_from) q.where("p.created_at", ">=", body.created_from)
  if (body.created_to) q.where("p.created_at", "<=", body.created_to)
  for (const flag of body.missing ?? []) q.whereRaw(MISSING_SQL[flag])
  return q
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

  // Same trap as brand: `filters.sales_channels` throws "Trying to
  // query by not existing property Product.sales_channels" because the
  // relation is a Module Link, not a column on Product. Medusa core's
  // admin /admin/products route handles this via `maybeApplyLinkFilter`
  // against the link entity `product_sales_channel`; we mirror that —
  // query the link table directly with both ends as filters so we only
  // pull the rows we need. If brand already narrowed the id set, scope
  // the link lookup to that subset too (turns 1500-row sweeps into
  // 200-row ones).
  if (body.sales_channel_ids?.length) {
    try {
      const linkFilters: Record<string, unknown> = {
        sales_channel_id: body.sales_channel_ids,
      }
      if (Array.isArray(filters.id)) {
        linkFilters.product_id = filters.id
      }
      const { data: linkRows = [] } = await query.graph({
        entity: "product_sales_channel",
        fields: ["product_id"],
        filters: linkFilters,
        pagination: { take: 10000, skip: 0 },
      })
      const ids = new Set<string>()
      for (const row of linkRows as any[]) {
        if (row?.product_id) ids.add(row.product_id)
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
      if (Array.isArray(filters.id)) {
        const existing = new Set(filters.id as string[])
        const intersection = [...ids].filter((id) => existing.has(id))
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
        filters.id = [...ids]
      }
    } catch (err: any) {
      res.status(500).json({
        message: `sales channel filter resolution failed: ${err?.message ?? err}`,
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

  // ── Data-quality filters ("Missing X") ──
  //
  // query.graph can't filter on a missing relation, so these run in SQL over
  // every product the other filters match: an exact count and no cap. Until
  // 27 Nov 2026 they post-filtered only the newest 600 products, so once the
  // 830 Legend Life drafts filled those slots every filter showed 0.
  //
  //   Pass 1 — the page's ids (or up to `ids_limit` for "Select all
  //            matching") and the total, in SQL.
  //   Pass 2 — full FIELDS for the page's ids only.
  if (hasQualityFilter) {
    let pageIds: string[] = []
    let total = 0
    try {
      const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
      const matching = missingProductsQuery(pg, body, filters.id as string[] | undefined)
      const [rows, countRow] = await Promise.all([
        matching
          .clone()
          .select("p.id")
          .orderBy(`p.${field}`, direction.toLowerCase())
          .orderBy("p.id")
          .limit(idsOnly ? idsLimit : limit)
          .offset(idsOnly ? 0 : offset),
        matching.clone().count("* as n").first(),
      ])
      pageIds = (rows as Array<{ id: string }>).map((r) => r.id)
      total = Number((countRow as { n?: string | number } | undefined)?.n ?? 0)
    } catch (err: any) {
      res.status(500).json({
        message: `products-manager list (pass 1) failed: ${err?.message ?? err}`,
      })
      return
    }

    if (idsOnly) {
      res.json({
        ids: pageIds,
        count: total,
        truncated: total > pageIds.length,
      })
      return
    }

    if (pageIds.length === 0) {
      res.json({
        products: [],
        count: total,
        limit,
        offset,
        truncated: false,
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
      products: await withPrices(req, ordered.map(toProductResponse)),
      count: total,
      limit,
      offset,
      truncated: false,
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
      // ids_only keeps only the ids, so don't hydrate relations for them.
      fields: idsOnly ? ["id"] : (FIELDS as unknown as string[]),
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
    products: await withPrices(req, raw.map(toProductResponse)),
    count: dbCount ?? raw.length + underlyingSkip,
    limit,
    offset,
    truncated: false,
  })
}

/** Supplier style code, from whichever importer's metadata block the product has. */
function supplierCode(m: Record<string, any> | null | undefined): string | null {
  const code =
    m?.ascolour?.styleCode ??
    m?.fashionbiz?.code ??
    m?.aussiepacific?.style_code ??
    m?.jbs_wear?.style_code ??
    m?.thread_lab?.style_code ??
    m?.shaka_wear?.style_code
  return typeof code === "string" && code ? code : null
}

/**
 * Adds `price_from`: the lowest single-unit AUD base price (1-9 tier, no price
 * list) across the product's variants, in dollars inc GST. One query per page.
 */
async function withPrices<T extends { id: string }>(
  req: MedusaRequest,
  products: T[]
): Promise<Array<T & { price_from: number | null }>> {
  const prices = new Map<string, number>()
  if (products.length) {
    try {
      const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
      const { rows } = await pg.raw(
        `select v.product_id, min(pr.amount) as amount
           from product_variant v
           join product_variant_price_set l on l.variant_id = v.id and l.deleted_at is null
           join price pr on pr.price_set_id = l.price_set_id and pr.deleted_at is null
          where v.product_id = any(?) and v.deleted_at is null and pr.price_list_id is null
            and pr.currency_code = 'aud' and pr.rules_count = 0 and coalesce(pr.min_quantity, 1) <= 1
          group by v.product_id`,
        [products.map((p) => p.id)]
      )
      for (const r of rows ?? []) prices.set(r.product_id, Number(r.amount))
    } catch {
      // Price is a nice-to-have on the card; never fail the list over it.
    }
  }
  return products.map((p) => ({ ...p, price_from: prices.get(p.id) ?? null }))
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
    print_profile:
      typeof p.metadata?.print_profile === "string"
        ? (p.metadata.print_profile as string)
        : null,
    supplier_code: supplierCode(p.metadata),
    quality: computeQuality(p),
  }
}
