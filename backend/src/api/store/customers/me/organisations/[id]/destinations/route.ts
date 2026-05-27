import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { requireMembership } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/[id]/destinations
 *
 * Read-only list of an org's destinations. Customer-side destination
 * management is intentionally not exposed (Phase 1 Q4) — staff manages
 * the destination network via admin.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const activeOnly =
    req.query?.active === "1" || req.query?.active === "true"

  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)

  const filters: Record<string, unknown> = {
    organisation_id: membership.organisation_id,
  }
  if (activeOnly) filters.is_active = true

  const destinations = (await service.listOrganisationDestinations(filters, {
    take: 500,
    order: { name: "ASC" },
  })) as any[]

  res.json({
    destinations: destinations.map((d) => ({
      id: d.id,
      organisation_id: d.organisation_id,
      name: d.name,
      code: d.code,
      address_1: d.address_1,
      address_2: d.address_2,
      city: d.city,
      province: d.province,
      postal_code: d.postal_code,
      country_code: d.country_code,
      contact_name: d.contact_name,
      contact_phone: d.contact_phone,
      contact_email: d.contact_email,
      delivery_notes: d.delivery_notes,
      is_active: d.is_active,
    })),
  })
}
