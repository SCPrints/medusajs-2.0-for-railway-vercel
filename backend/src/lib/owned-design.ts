import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { DESIGNS_MODULE } from "../modules/designs"
import type DesignsModuleService from "../modules/designs/service"

/**
 * Load a saved design that MUST belong to `customerId`. A design that is
 * missing or owned by someone else is a 404 (never 403) so design ids can't
 * be enumerated. Shared by the `/store/customers/me/designs/:id` routes and
 * group-order creation (code review 2026-10, finding 4-2).
 */
export async function loadOwnedDesign(
  scope: MedusaContainer,
  designId: string,
  customerId: string
) {
  const designsService = scope.resolve<DesignsModuleService>(DESIGNS_MODULE)
  let design: any
  try {
    design = await designsService.retrieveDesign(designId)
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Design "${designId}" was not found.`)
  }
  if (design.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Design "${designId}" was not found.`)
  }
  return { design, designsService }
}
