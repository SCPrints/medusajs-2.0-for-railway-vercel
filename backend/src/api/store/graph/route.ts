import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isStorefrontOriginAllowed } from "../../../lib/storefront-origins"

/**
 * GET /store/graph
 *
 * Nodes/Links JSON for the storefront "Explore" catalog map.
 *
 * Modes:
 *   - `summary` (default): root + brands + categories + product types + tags,
 *     each with a product count. No product nodes. Built from four GROUP BY
 *     queries (no product hydration) and cached in-process for 5 minutes.
 *   - `brand` / `category` / `type` / `tag`: products for one hub + links to
 *     their brand / categories / type / tags. Cached per (mode, id, page).
 *
 * Query params: mode, brand (name), category_id, type_id, tag_id, limit
 * (default 200, max 500), offset.
 *
 * 2026-10: rewritten from a full-catalog paginate (3.6–4.5 s per summary call,
 * 10–16 s per brand expansion because every variant's prices + metadata were
 * hydrated for a hover-only price). Prices are no longer emitted at all — the
 * old min-over-all-price-rows leaked B2B tier prices to guests.
 */

type NodeKind = "root" | "brand" | "category" | "product" | "type" | "tag"

type GraphNode = {
  id: string
  kind: NodeKind
  label: string
  /** Product handle (product nodes) or brand handle (brand nodes, for logo lookup). */
  handle?: string
  thumbnail?: string | null
  productCount?: number
}

type GraphLinkKind =
  | "product-brand"
  | "product-category"
  | "product-type"
  | "product-tag"
  | "category-parent"
  | "brand-root"
  | "category-root"
  | "type-root"
  | "tag-root"

type GraphLink = { source: string; target: string; kind: GraphLinkKind }

type GraphMode = "summary" | "brand" | "category" | "type" | "tag"

type GraphPayload = {
  nodes: GraphNode[]
  links: GraphLink[]
  mode: GraphMode
  offset?: number
  total?: number
}

type ProductRow = {
  id: string
  handle: string | null
  title: string
  thumbnail: string | null
  brand?: { name?: string; handle?: string } | Array<{ name?: string; handle?: string }> | null
  type?: { id: string; value: string } | null
  tags?: Array<{ id: string; value: string }>
  categories?: Array<{ id: string; name: string }>
}

type QueryGraph = {
  graph: (args: Record<string, unknown>) => Promise<{
    data: unknown[]
    metadata?: { count?: number }
  }>
}

const ROOT_ID = "root"
const ROOT_NODE: GraphNode = { id: ROOT_ID, kind: "root", label: "Catalog" }

const DEFAULT_LIMIT = 200
const HARD_MAX_LIMIT = 500

/** Products the storefront never lists (setup-fee / vectorisation service rows). */
const NOT_INTERNAL_SERVICE_SQL = `coalesce(product.metadata->>'internal_service', '') <> 'true'`

// ── In-process cache (per machine; same shape as shop-categories/menu) ──────
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 200
const cache = new Map<string, { exp: number; payload: GraphPayload }>()
const inFlight = new Map<string, Promise<GraphPayload>>()

async function cached(key: string, build: () => Promise<GraphPayload>): Promise<GraphPayload> {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.payload
  let p = inFlight.get(key)
  if (!p) {
    p = build()
      .then((payload) => {
        if (cache.size >= CACHE_MAX_ENTRIES) {
          const oldest = cache.keys().next().value
          if (oldest) cache.delete(oldest)
        }
        cache.set(key, { exp: Date.now() + CACHE_TTL_MS, payload })
        return payload
      })
      .finally(() => inFlight.delete(key))
    inFlight.set(key, p)
  }
  return p
}

// ── Summary: four GROUP BY queries, no product hydration ────────────────────

/** Join + filter shared by every count query: published, live, not a service product. */
function publishedProducts(pg: any, table: string, productIdColumn: string) {
  return pg(table)
    .join("product", "product.id", `${table}.${productIdColumn}`)
    .where("product.status", "published")
    .whereNull("product.deleted_at")
    .whereRaw(NOT_INTERNAL_SERVICE_SQL)
}

async function buildSummary(pg: any): Promise<GraphPayload> {
  const nodes: GraphNode[] = [ROOT_NODE]
  const links: GraphLink[] = []

  const [categoryRows, categoryCounts, brandRows, brandCounts, typeRows, tagRows] =
    await Promise.all([
      pg("product_category")
        .whereNull("deleted_at")
        .where({ is_active: true, is_internal: false })
        .whereRaw(`coalesce(metadata->>'is_hidden_from_menu', '') <> 'true'`)
        .select("id", "name", "handle", "parent_category_id") as Promise<
        Array<{ id: string; name: string; handle: string; parent_category_id: string | null }>
      >,
      publishedProducts(pg, "product_category_product", "product_id")
        .groupBy("product_category_product.product_category_id")
        .select("product_category_product.product_category_id as id")
        .count("product.id as count") as Promise<Array<{ id: string; count: string }>>,
      pg("brand")
        .whereNull("deleted_at")
        .where({ is_active: true })
        .select("id", "name", "handle") as Promise<
        Array<{ id: string; name: string; handle: string }>
      >,
      publishedProducts(pg, "product_product_brand_brand", "product_id")
        .whereNull("product_product_brand_brand.deleted_at")
        .groupBy("product_product_brand_brand.brand_id")
        .select("product_product_brand_brand.brand_id as id")
        .count("product.id as count") as Promise<Array<{ id: string; count: string }>>,
      pg("product")
        .join("product_type", "product_type.id", "product.type_id")
        .where("product.status", "published")
        .whereNull("product.deleted_at")
        .whereNull("product_type.deleted_at")
        .whereRaw(NOT_INTERNAL_SERVICE_SQL)
        .groupBy("product_type.id", "product_type.value")
        .select("product_type.id as id", "product_type.value as value")
        .count("product.id as count") as Promise<
        Array<{ id: string; value: string; count: string }>
      >,
      publishedProducts(pg, "product_tags", "product_id")
        .join("product_tag", "product_tag.id", "product_tags.product_tag_id")
        .whereNull("product_tag.deleted_at")
        .groupBy("product_tag.id", "product_tag.value")
        .select("product_tag.id as id", "product_tag.value as value")
        .count("product.id as count") as Promise<
        Array<{ id: string; value: string; count: string }>
      >,
    ])

  const countById = (rows: Array<{ id: string; count: string }>) =>
    new Map(rows.map((r) => [r.id, Number(r.count) || 0]))
  const catCount = countById(categoryCounts)
  const brandCount = countById(brandCounts)

  // Categories: keep every top-level audience (so the ring is stable even if
  // one is temporarily empty) and only sub-categories that actually hold stock.
  const categoryIds = new Set(categoryRows.map((c) => c.id))
  for (const cat of categoryRows) {
    const count = catCount.get(cat.id) ?? 0
    const hasParent = Boolean(cat.parent_category_id && categoryIds.has(cat.parent_category_id))
    if (hasParent && count === 0) continue
    nodes.push({ id: `cat:${cat.id}`, kind: "category", label: cat.name, handle: cat.handle, productCount: count })
    links.push(
      hasParent
        ? { source: `cat:${cat.id}`, target: `cat:${cat.parent_category_id}`, kind: "category-parent" }
        : { source: `cat:${cat.id}`, target: ROOT_ID, kind: "category-root" }
    )
  }

  for (const b of brandRows) {
    nodes.push({ id: `brand:${b.name}`, kind: "brand", label: b.name, handle: b.handle, productCount: brandCount.get(b.id) ?? 0 })
    links.push({ source: `brand:${b.name}`, target: ROOT_ID, kind: "brand-root" })
  }

  for (const t of typeRows) {
    nodes.push({ id: `type:${t.id}`, kind: "type", label: t.value, productCount: Number(t.count) || 0 })
    links.push({ source: `type:${t.id}`, target: ROOT_ID, kind: "type-root" })
  }

  for (const t of tagRows) {
    nodes.push({ id: `tag:${t.id}`, kind: "tag", label: t.value, productCount: Number(t.count) || 0 })
    links.push({ source: `tag:${t.id}`, target: ROOT_ID, kind: "tag-root" })
  }

  return { nodes, links, mode: "summary" }
}

// ── Product modes ───────────────────────────────────────────────────────────

const PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "thumbnail",
  "brand.name",
  "brand.handle",
  "type.id",
  "type.value",
  "tags.id",
  "tags.value",
  "categories.id",
  "categories.name",
]

async function fetchProducts(
  query: QueryGraph,
  filters: Record<string, unknown>,
  limit: number,
  offset: number
): Promise<{ rows: ProductRow[]; total: number }> {
  const { data, metadata } = await query.graph({
    entity: "product",
    fields: PRODUCT_FIELDS,
    filters: { status: "published", ...filters },
    pagination: { take: limit, skip: offset },
  })
  const rows = ((data as ProductRow[]) ?? []).filter((r) => r.handle)
  return { rows, total: metadata?.count ?? rows.length }
}

function brandOf(row: ProductRow): { name: string; handle?: string } | null {
  const b = Array.isArray(row.brand) ? row.brand[0] : row.brand
  const name = b?.name?.trim()
  return name ? { name, handle: b?.handle } : null
}

/**
 * Emit the product node, its links, and any hub nodes (brand / categories /
 * type / tags) it references so the client merge never produces a dangling
 * link. `hub` is the node this expansion was requested for.
 */
function appendProducts(
  rows: ProductRow[],
  nodes: GraphNode[],
  links: GraphLink[],
  hubId: string
) {
  const seen = new Set<string>([hubId])
  const hub = (node: GraphNode) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    nodes.push(node)
  }
  for (const row of rows) {
    const id = `prod:${row.id}`
    nodes.push({ id, kind: "product", label: row.title, handle: row.handle ?? undefined, thumbnail: row.thumbnail ?? null })

    const brand = brandOf(row)
    if (brand) {
      hub({ id: `brand:${brand.name}`, kind: "brand", label: brand.name, handle: brand.handle })
      links.push({ source: id, target: `brand:${brand.name}`, kind: "product-brand" })
    }
    for (const cat of row.categories ?? []) {
      hub({ id: `cat:${cat.id}`, kind: "category", label: cat.name })
      links.push({ source: id, target: `cat:${cat.id}`, kind: "product-category" })
    }
    if (row.type?.id) {
      hub({ id: `type:${row.type.id}`, kind: "type", label: row.type.value })
      links.push({ source: id, target: `type:${row.type.id}`, kind: "product-type" })
    }
    for (const tag of row.tags ?? []) {
      hub({ id: `tag:${tag.id}`, kind: "tag", label: tag.value })
      links.push({ source: id, target: `tag:${tag.id}`, kind: "product-tag" })
    }
  }
}

async function buildBrand(
  query: QueryGraph,
  pg: any,
  brandName: string,
  limit: number,
  offset: number
): Promise<GraphPayload> {
  const brand: { id: string; name: string; handle: string } | undefined = await pg("brand")
    .whereNull("deleted_at")
    .whereRaw("lower(name) = ?", [brandName.toLowerCase()])
    .select("id", "name", "handle")
    .first()

  const hubId = `brand:${brandName}`
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  if (!brand) {
    nodes.push({ id: hubId, kind: "brand", label: brandName, productCount: 0 })
    return { nodes, links, mode: "brand", offset, total: 0 }
  }

  // Product ids come from the Module Link table — the single source of truth.
  const linkRows: Array<{ product_id: string }> = await pg("product_product_brand_brand")
    .where({ brand_id: brand.id })
    .whereNull("deleted_at")
    .select("product_id")
  const ids = linkRows.map((r) => r.product_id)

  const { rows, total } = ids.length
    ? await fetchProducts(query, { id: ids }, limit, offset)
    : { rows: [], total: 0 }

  nodes.push({ id: hubId, kind: "brand", label: brand.name, handle: brand.handle, productCount: total })
  appendProducts(rows, nodes, links, hubId)
  return { nodes, links, mode: "brand", offset, total }
}

async function buildHub(
  query: QueryGraph,
  pg: any,
  mode: "category" | "type" | "tag",
  id: string,
  limit: number,
  offset: number
): Promise<GraphPayload> {
  const spec = {
    category: { table: "product_category", labelCol: "name", filter: { categories: { id } }, prefix: "cat" },
    type: { table: "product_type", labelCol: "value", filter: { type_id: id }, prefix: "type" },
    tag: { table: "product_tag", labelCol: "value", filter: { tags: { id } }, prefix: "tag" },
  }[mode]

  const [labelRow, { rows, total }] = await Promise.all([
    pg(spec.table).where({ id }).whereNull("deleted_at").select(`${spec.labelCol} as label`).first() as Promise<
      { label: string } | undefined
    >,
    fetchProducts(query, spec.filter, limit, offset),
  ])

  const hubId = `${spec.prefix}:${id}`
  const nodes: GraphNode[] = [
    { id: hubId, kind: mode, label: labelRow?.label ?? mode, productCount: total },
  ]
  const links: GraphLink[] = []
  appendProducts(rows, nodes, links, hubId)
  return { nodes, links, mode, offset, total }
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function setCors(req: MedusaRequest, res: MedusaResponse) {
  const origin = req.headers.origin ?? ""
  if (origin && isStorefrontOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-publishable-api-key")
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

function clampLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), HARD_MAX_LIMIT)
}

function clampOffset(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : ""
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCors(req, res)
  return res.status(204).send()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCors(req, res)
  // max-age so the browser reuses an expansion it already fetched this session.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=3600")

  const mode = str(req.query.mode).toLowerCase()
  const limit = clampLimit(req.query.limit)
  const offset = clampOffset(req.query.offset)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  try {
    let payload: GraphPayload
    if (mode === "brand") {
      const brand = str(req.query.brand)
      if (!brand) return res.status(400).json({ error: "Missing `brand` query parameter for mode=brand" })
      payload = await cached(`brand:${brand.toLowerCase()}:${limit}:${offset}`, () =>
        buildBrand(query, pg, brand, limit, offset)
      )
    } else if (mode === "category" || mode === "type" || mode === "tag") {
      const id = str(req.query[`${mode}_id`])
      if (!id) return res.status(400).json({ error: `Missing \`${mode}_id\` query parameter for mode=${mode}` })
      payload = await cached(`${mode}:${id}:${limit}:${offset}`, () =>
        buildHub(query, pg, mode, id, limit, offset)
      )
    } else {
      payload = await cached("summary", () => buildSummary(pg))
    }
    return res.status(200).json(payload)
  } catch (error) {
    console.error("[/store/graph] failed to build graph payload", error)
    return res.status(500).json({
      error: "Failed to build graph payload",
      message: error instanceof Error ? error.message : "unknown error",
    })
  }
}
