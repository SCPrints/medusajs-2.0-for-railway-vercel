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
  if (body.brand_ids?.length) filters.brand = { id: body.brand_ids }
  if (body.q?.trim()) {
    // Title ilike is the closest match to Medusa's product `q` semantics
    // we get through query.graph. Acceptable trade-off for v1; we miss
    // description/handle hits but get a fast indexed match on the most
    // useful field.
    filters.title = { $ilike: `%${body.q.trim().replace(/[%_]/g, "")}%` }
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
  const direction = orderRaw.startsWith("-") ? "DESC" : "ASC"

  // Underlying fetch cap. For ids_only ("select all matching") we
  // honour the requested cap; otherwise we pull up to 2000 and
  // paginate in-memory after data-quality filtering.
  const idsOnly = !!body.ids_only
  const idsLimit = body.ids_limit ?? 1000
  const underlyingTake = idsOnly ? Math.min(idsLimit, 1000) : 2000

  let raw: RawProduct[] = []
  try {
    const { data } = await query.graph({
      entity: "product",
      fields: FIELDS as unknown as string[],
      filters,
      pagination: {
        take: underlyingTake,
        skip: 0,
        order: { [field]: direction },
      },
    })
    raw = (data as RawProduct[]) ?? []
  } catch (err: any) {
    res.status(500).json({
      message: `products-manager list query failed: ${err?.message ?? err}`,
    })
    return
  }

  // Apply data-quality post-filter (cheap walk).
  let filtered: RawProduct[] = raw
  if (body.missing?.length) {
    const flags = new Set(body.missing)
    filtered = raw.filter((p) => {
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
  }

  const totalCount = filtered.length
  const truncated = raw.length >= underlyingTake

  if (idsOnly) {
    res.json({
      ids: filtered.slice(0, idsLimit).map((p) => p.id),
      count: totalCount,
      truncated,
    })
    return
  }

  const limit = body.limit ?? 50
  const offset = body.offset ?? 0
  const page = filtered.slice(offset, offset + limit)

  const products = page.map((p) => {
    const brand = readBrand(p)
    const variantCount = Array.isArray(p.variants) ? p.variants.length : 0
    const tags = Array.isArray(p.tags) ? p.tags : []
    const categories = Array.isArray(p.categories) ? p.categories : []
    const salesChannels = Array.isArray(p.sales_channels)
      ? p.sales_channels
      : []
    return {
      id: p.id,
      title: p.title ?? null,
      handle: p.handle ?? null,
      thumbnail: p.thumbnail ?? null,
      status: p.status ?? null,
      created_at: p.created_at ?? null,
      variant_count: variantCount,
      type: p.type?.id
        ? { id: p.type.id, value: p.type.value ?? null }
        : null,
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
  })

  res.json({
    products,
    count: totalCount,
    limit,
    offset,
    truncated,
  })
}
