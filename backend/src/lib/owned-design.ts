import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { DESIGNS_MODULE } from "../modules/designs"
import type DesignsModuleService from "../modules/designs/service"
import {
  isVisibleTo,
  listCustomerOrgs,
  sharingFields,
  type CustomerOrg,
} from "./customer-org-sharing"

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

/**
 * Load a saved design the customer may READ: their own, or one shared to an
 * organisation they belong to. Anything else is a 404. Writes still go
 * through `loadOwnedDesign`.
 */
export async function loadVisibleDesign(
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
  // Own designs skip the membership lookup.
  const orgs = design.customer_id === customerId ? [] : await listCustomerOrgs(scope, customerId)
  if (!isVisibleTo(design, customerId, orgs)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Design "${designId}" was not found.`)
  }
  return { design, designsService, orgs }
}

/**
 * Add `can_edit`, `shared_from` and `base_product_handle` to designs. Product
 * handles are resolved in one query; a deleted product resolves to null.
 */
export async function decorateDesigns(
  scope: MedusaContainer,
  designs: any[],
  customerId: string,
  orgs: CustomerOrg[]
) {
  const productIds = [
    ...new Set(designs.map((d) => d.base_product_id).filter((id): id is string => !!id)),
  ]
  const handleById = new Map<string, string>()
  if (productIds.length > 0) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { id: productIds },
    })
    for (const p of (data as Array<{ id: string; handle?: string | null }>) ?? []) {
      if (p.handle) handleById.set(p.id, p.handle)
    }
  }
  return designs.map((d) => ({
    ...d,
    ...sharingFields(d, customerId, orgs),
    base_product_handle: (d.base_product_id && handleById.get(d.base_product_id)) || null,
  }))
}
