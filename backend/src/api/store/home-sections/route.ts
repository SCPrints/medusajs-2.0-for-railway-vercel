import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HOME_SECTION_MODULE } from "../../../modules/home-section"
import type HomeSectionModuleService from "../../../modules/home-section/service"

/**
 * Public list of published home sections, ordered for display.
 * Returns section metadata + the ordered product handles; the storefront
 * hydrates those handles into region-priced products itself (keeps all
 * pricing/region logic on the storefront, same as the lookbook pattern).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<HomeSectionModuleService>(
    HOME_SECTION_MODULE
  )
  const sections = await service.listHomeSections(
    { is_published: true },
    { order: { weight: "ASC" }, take: 50 }
  )
  res.json({
    sections: (sections as any[]).map((s) => ({
      id: s.id,
      handle: s.handle,
      title: s.title,
      subtitle: s.subtitle,
      product_handles:
        (s.product_handles as { handles?: string[] })?.handles ?? [],
    })),
  })
}
