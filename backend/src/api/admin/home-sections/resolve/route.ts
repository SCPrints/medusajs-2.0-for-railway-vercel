import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLES_MODULE } from "../../../../modules/bundles"
import type BundlesModuleService from "../../../../modules/bundles/service"

/** Curated handles can reference a bundle by prefixing its handle. */
const BUNDLE_PREFIX = "bundle:"

/**
 * Resolve a set of curated handles → lightweight summaries. Handles are
 * either plain product handles or bundle references (`bundle:<handle>`).
 * The admin home-sections page uses this both to render the selected
 * entries (with thumbnails) and to flag handles that no longer resolve
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

  const productHandles = handles.filter((h) => !h.startsWith(BUNDLE_PREFIX))
  const bundleHandles = handles
    .filter((h) => h.startsWith(BUNDLE_PREFIX))
    .map((h) => h.slice(BUNDLE_PREFIX.length))
    .filter(Boolean)

  const out: Array<{
    id: string
    handle: string
    title: string
    thumbnail: string | null
    status: string
    kind: "product" | "bundle"
  }> = []

  if (productHandles.length) {
    const productService = req.scope.resolve(Modules.PRODUCT) as any
    const products = await productService.listProducts(
      { handle: productHandles },
      { select: ["id", "handle", "title", "thumbnail", "status"], take: 60 }
    )
    for (const p of products as any[]) {
      out.push({
        id: p.id,
        handle: p.handle,
        title: p.title,
        thumbnail: p.thumbnail ?? null,
        status: p.status,
        kind: "product",
      })
    }
  }

  if (bundleHandles.length) {
    const bundleService =
      req.scope.resolve<BundlesModuleService>(BUNDLES_MODULE)
    const [bundles] = await bundleService.listAndCountBundles(
      { handle: bundleHandles },
      { take: 60 }
    )
    for (const b of bundles as any[]) {
      out.push({
        id: b.id,
        // Echo back the prefixed handle so the picker can match it against
        // the curated value list (which stores `bundle:<handle>`).
        handle: `${BUNDLE_PREFIX}${b.handle}`,
        title: b.title,
        thumbnail: b.thumbnail_url ?? null,
        // Map the bundle's own status onto the product-status vocabulary the
        // picker already understands ("published" = live).
        status: b.status === "active" ? "published" : "draft",
        kind: "bundle",
      })
    }
  }

  res.json({ products: out })
}
