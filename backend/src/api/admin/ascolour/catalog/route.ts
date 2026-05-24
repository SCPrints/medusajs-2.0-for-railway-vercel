import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../../../../modules/ascolour"
import AsColourService from "../../../../modules/ascolour/service"

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const handleForStyle = (styleCode: string, productName?: string) => {
  const name = productName ?? styleCode
  return `as-colour-${slugify(`${name}-${styleCode}`)}`
}

/**
 * AS Colour appends "S" to a styleCode to mark it as superseded/discontinued
 * (verified empirically via probe-ascolour-product-shape.ts: 141/629 styles
 * end in "S" and 75 of them have a paired non-S base still in the catalog —
 * the characteristic "current ↔ superseded" pattern).
 *
 * Single source of truth used by both the catalog filter here and the import
 * route's server-side skip — keep them in sync.
 */
const isDiscontinuedStyleCode = (styleCode: string | null | undefined) =>
  /S$/.test(String(styleCode ?? ""))

/**
 * GET /admin/ascolour/catalog
 *
 * Fetches the AS Colour product catalogue and annotates each product with
 * whether it already exists in Medusa and whether the styleCode marks it as
 * superseded/discontinued (suffix "S").
 *
 * Discontinued styles are filtered out by default so the admin never
 * accidentally imports run-out stock. Set `?include_discontinued=1` to
 * surface them with a DISCONTINUED badge.
 *
 * Query params:
 *   search               — filter by productName or styleCode (case-insensitive)
 *   limit                — page size (default 50)
 *   offset               — pagination offset (default 0)
 *   include_discontinued — "1" to include styleCode-ending-in-S styles (default: filtered out)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let ascolour: AsColourService
  try {
    ascolour = req.scope.resolve(ASCOLOUR_MODULE) as AsColourService
  } catch {
    return res.status(503).json({ error: "AS Colour module not configured." })
  }

  const search = ((req.query.search as string | undefined) ?? "").trim().toLowerCase()
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200)
  const offset = Math.max(Number(req.query.offset ?? 0), 0)
  const includeDiscontinued =
    req.query.include_discontinued === "1" ||
    req.query.include_discontinued === "true"

  // Fetch full catalog (paginated API, returns all pages)
  let products = await ascolour.fetchAllProducts()

  // Filter discontinued unless explicitly requested. Tracked separately so
  // the response can tell the UI "we hid N discontinued items".
  let discontinuedFilteredOut = 0
  if (!includeDiscontinued) {
    const before = products.length
    products = products.filter((p) => !isDiscontinuedStyleCode(p.styleCode))
    discontinuedFilteredOut = before - products.length
  }

  // Filter by search
  if (search) {
    products = products.filter(
      (p) =>
        (p as any).productName?.toLowerCase().includes(search) ||
        p.styleCode?.toLowerCase().includes(search) ||
        (p as any).styleName?.toLowerCase().includes(search)
    )
  }

  const total = products.length
  const page = products.slice(offset, offset + limit)

  // Check which handles already exist in Medusa
  const handles = page.map((p) => handleForStyle(p.styleCode, (p as any).productName))
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: handles },
  })
  const existingHandles = new Set((existing ?? []).map((p: any) => p.handle as string))

  const rows = page.map((p) => {
    const handle = handleForStyle(p.styleCode, (p as any).productName)
    const rawStyleName = (p as any).styleName ?? ""
    const cleanedName = rawStyleName.replace(/\s*\|\s*\d+[A-Z]*\s*$/, "").trim()
    return {
      style_code: p.styleCode,
      name: cleanedName || (p as any).productName || p.styleCode,
      category: (p as any).category ?? (p as any).productType ?? null,
      handle,
      already_imported: existingHandles.has(handle),
      is_discontinued: isDiscontinuedStyleCode(p.styleCode),
    }
  })

  return res.json({
    products: rows,
    total,
    offset,
    limit,
    discontinued_filtered_out: discontinuedFilteredOut,
  })
}
