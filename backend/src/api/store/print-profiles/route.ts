import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { PRINT_PROFILE_MODULE } from "../../../modules/print-profile"
import type PrintProfileModuleService from "../../../modules/print-profile/service"

/**
 * Public catalog of print profiles. The storefront customizer fetches this
 * (cached) and resolves a product's `metadata.print_profile` handle → areas to
 * gate which sides / methods / sizes the customer can pick. Small, slow-moving
 * dataset (a handful of profiles), safe to cache aggressively.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)
  const [profiles] = await service.listAndCountPrintProfiles(
    {},
    { order: { position: "ASC", created_at: "ASC" } }
  )
  res.json({
    print_profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      handle: p.handle,
      areas: p.areas ?? [],
    })),
    count: profiles.length,
  })
}
