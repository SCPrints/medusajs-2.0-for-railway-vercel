import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { LOOKBOOK_MODULE } from "../../../modules/lookbook"
import type LookbookModuleService from "../../../modules/lookbook/service"

type ResolvedProduct = {
  handle: string
  title: string
  thumbnail: string | null
}

/**
 * Public lookbook list — only published items. Safe to expose
 * via the storefront with no auth. Paginated via `limit`/`offset`.
 *
 * Returns `count` (total published tiles) so the storefront can render
 * numbered pages, and `tags` (the global tag universe across all
 * published tiles) so the filter chips stay stable across pages.
 *
 * Each tile's linked product handles are resolved (in ONE batch query for the
 * whole page) to live, published product summaries so the storefront "Start a
 * job like this" CTA can deep-link to the garment's PDP. Handles that no longer
 * resolve — deleted, draft, or not re-imported — are dropped here, never
 * surfaced as a dead link.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "24"), 10) || 24, 1),
    48
  )
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0)

  const service = req.scope.resolve<LookbookModuleService>(LOOKBOOK_MODULE)

  const [items, count] = await service.listAndCountLookbookItems(
    { is_published: true },
    { order: { weight: "ASC", id: "ASC" }, take: limit, skip: offset }
  )

  // Global tag universe across all published tiles (cheap — tags column only).
  const tagRows = await service.listLookbookItems(
    { is_published: true },
    { select: ["tags"], take: 1000 }
  )
  const tags = Array.from(
    new Set(
      (tagRows as any[]).flatMap(
        (r) => (r.tags as { values?: string[] })?.values ?? []
      )
    )
  )
    .filter(Boolean)
    .sort()

  // Batch-resolve every linked handle on this page → published product summary.
  const handlesPerItem = (items as any[]).map(
    (i) => (i.product_handles as { handles?: string[] })?.handles ?? []
  )
  const uniqueHandles = Array.from(
    new Set(handlesPerItem.flat().filter(Boolean))
  )
  const byHandle = new Map<string, ResolvedProduct>()
  if (uniqueHandles.length) {
    try {
      const productService = req.scope.resolve(Modules.PRODUCT) as any
      const products = await productService.listProducts(
        { handle: uniqueHandles, status: "published" },
        { select: ["handle", "title", "thumbnail"], take: uniqueHandles.length }
      )
      for (const p of products as any[]) {
        byHandle.set(p.handle, {
          handle: p.handle,
          title: p.title,
          thumbnail: p.thumbnail ?? null,
        })
      }
    } catch {
      // Resolution is best-effort — a product-module hiccup just means the CTA
      // falls back to /contact, never a broken page.
    }
  }

  res.json({
    count,
    limit,
    offset,
    tags,
    items: (items as any[]).map((i, idx) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      image_url: i.image_url,
      attribution: i.attribution,
      tags: (i.tags as { values?: string[] })?.values ?? [],
      // Order-preserving: keep the staff-curated handle order, drop misses.
      products: handlesPerItem[idx]
        .map((h) => byHandle.get(h))
        .filter(Boolean) as ResolvedProduct[],
    })),
  })
}
