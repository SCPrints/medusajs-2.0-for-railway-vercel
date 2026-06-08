import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { LOOKBOOK_MODULE } from "../../../modules/lookbook"
import type LookbookModuleService from "../../../modules/lookbook/service"

/**
 * Public lookbook list — only published items. Safe to expose
 * via the storefront with no auth. Paginated via `limit`/`offset`.
 *
 * Returns `count` (total published tiles) so the storefront can render
 * numbered pages, and `tags` (the global tag universe across all
 * published tiles) so the filter chips stay stable across pages.
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

  res.json({
    count,
    limit,
    offset,
    tags,
    items: (items as any[]).map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      image_url: i.image_url,
      attribution: i.attribution,
      tags: (i.tags as { values?: string[] })?.values ?? [],
      product_ids: (i.product_ids as { ids?: string[] })?.ids ?? [],
    })),
  })
}
