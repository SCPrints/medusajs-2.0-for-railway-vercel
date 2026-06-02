import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * Resolve a set of product handles → lightweight product summaries.
 * The admin home-sections page uses this both to render the selected
 * products (with thumbnails) and to flag handles that no longer resolve
 * (requested but absent from the response = unresolved / stale curation).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const raw = String(req.query.handles ?? "").trim()
  const handles = raw
    ? raw
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 60)
    : []

  if (!handles.length) {
    return res.json({ products: [] })
  }

  const productService = req.scope.resolve(Modules.PRODUCT) as any
  const products = await productService.listProducts(
    { handle: handles },
    {
      select: ["id", "handle", "title", "thumbnail", "status"],
      take: 60,
    }
  )

  res.json({
    products: (products as any[]).map((p) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      thumbnail: p.thumbnail ?? null,
      status: p.status,
    })),
  })
}
