import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { FASHIONBIZ_MODULE } from "../../../../modules/fashionbiz"
import FashionBizService from "../../../../modules/fashionbiz/service"
import { FashionBizBrandSlug } from "../../../../modules/fashionbiz/types"
import { handleForProduct } from "../../../../modules/fashionbiz/mapping"

const VALID_BRANDS = new Set<FashionBizBrandSlug>([
  "biz-collection",
  "biz-care",
  "biz-corporates",
  "syzmik",
  "good-mates",
])

/**
 * Per-process cache of the bulk catalog (one entry per brand). FashionBiz's
 * `/simple/` stub endpoint omits `sales_status`, so to honour the clearance
 * filter the catalog endpoint walks the paginated `/products/` endpoint and
 * caches the lightweight projection here for 30 minutes.
 *
 * First request per brand costs ~5s (25 pages × 200ms throttle). Subsequent
 * requests for the same brand return instantly from cache.
 */
type CatalogRow = {
  slug: string
  code: string
  name: string
  sales_status: string
}
type BrandCacheEntry = { rows: CatalogRow[]; fetchedAt: number }
const BRAND_CACHE = new Map<FashionBizBrandSlug, BrandCacheEntry>()
const BRAND_CACHE_TTL_MS = 30 * 60 * 1000

async function getCatalogRows(
  fashionbiz: FashionBizService,
  brand: FashionBizBrandSlug,
  forceRefresh: boolean
): Promise<CatalogRow[]> {
  const entry = BRAND_CACHE.get(brand)
  if (
    !forceRefresh &&
    entry &&
    Date.now() - entry.fetchedAt < BRAND_CACHE_TTL_MS
  ) {
    return entry.rows
  }

  const detailed = await fashionbiz.fetchAllProductsWithDetail(brand)
  const rows: CatalogRow[] = detailed.map((p) => ({
    slug: p.slug,
    code: p.code,
    name: p.name,
    sales_status: (p.sales_status ?? "").toString().trim().toLowerCase(),
  }))
  BRAND_CACHE.set(brand, { rows, fetchedAt: Date.now() })
  return rows
}

/**
 * GET /admin/fashionbiz/catalog
 *
 * Fetches the live FashionBiz product list for a brand and annotates each
 * product with whether it already exists in Medusa (keyed by handle) and
 * whether the supplier has flagged it as clearance.
 *
 * Discontinued (`sales_status === "clearance"`) styles are filtered out by
 * default so the admin never accidentally imports run-out stock. Set
 * `?include_discontinued=1` to surface them with a CLEARANCE badge.
 *
 * Query params:
 *   brand                — FashionBiz brand slug (required)
 *   search               — filter by name or code (case-insensitive)
 *   limit                — page size (default 50)
 *   offset               — pagination offset (default 0)
 *   include_discontinued — "1" to include sales_status=clearance (default: filtered out)
 *   refresh              — "1" to bypass the 30-min brand cache
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let fashionbiz: FashionBizService
  try {
    fashionbiz = req.scope.resolve(FASHIONBIZ_MODULE) as FashionBizService
  } catch {
    return res.status(503).json({
      error: "FashionBiz module not configured. Set FASHIONBIZ_API_TOKEN.",
    })
  }

  const brand = (req.query.brand as string | undefined)?.trim() as
    | FashionBizBrandSlug
    | undefined
  if (!brand || !VALID_BRANDS.has(brand)) {
    return res.status(400).json({
      error: `Invalid brand. Must be one of: ${[...VALID_BRANDS].join(", ")}`,
    })
  }

  const search = ((req.query.search as string | undefined) ?? "")
    .trim()
    .toLowerCase()
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200)
  const offset = Math.max(Number(req.query.offset ?? 0), 0)
  const includeDiscontinued =
    req.query.include_discontinued === "1" ||
    req.query.include_discontinued === "true"
  const forceRefresh =
    req.query.refresh === "1" || req.query.refresh === "true"

  let rows: CatalogRow[]
  try {
    rows = await getCatalogRows(fashionbiz, brand, forceRefresh)
  } catch (err: any) {
    return res.status(502).json({
      error: `FashionBiz catalog fetch failed: ${err?.message ?? String(err)}`,
    })
  }

  // Filter discontinued unless explicitly requested. Tracked separately so
  // the response can tell the UI "we hid N clearance items".
  let discontinuedFilteredOut = 0
  if (!includeDiscontinued) {
    const before = rows.length
    rows = rows.filter((r) => r.sales_status !== "clearance")
    discontinuedFilteredOut = before - rows.length
  }

  // Search filter.
  if (search) {
    rows = rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(search) ||
        r.code?.toLowerCase().includes(search) ||
        r.slug?.toLowerCase().includes(search)
    )
  }

  const total = rows.length
  const page = rows.slice(offset, offset + limit)

  // Check which handles already exist in Medusa
  const handles = page.map((r) => handleForProduct(brand, r.slug))
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: handles },
  })
  const existingHandles = new Set(
    (existing ?? []).map((p: any) => p.handle as string)
  )

  const products = page.map((r) => ({
    slug: r.slug,
    code: r.code,
    name: r.name,
    brand,
    handle: handleForProduct(brand, r.slug),
    already_imported: existingHandles.has(handleForProduct(brand, r.slug)),
    sales_status: r.sales_status || null,
    is_discontinued: r.sales_status === "clearance",
  }))

  return res.json({
    products,
    total,
    offset,
    limit,
    discontinued_filtered_out: discontinuedFilteredOut,
  })
}
