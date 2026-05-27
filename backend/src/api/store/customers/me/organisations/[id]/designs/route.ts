import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { requireMembership } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/[id]/designs
 *
 * Read-only list of an org's active designs. Print file URLs are
 * stripped — those are staff-only.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)

  const designs = (await service.listOrganisationDesigns(
    { organisation_id: membership.organisation_id, is_active: true } as any,
    { take: 200, order: { created_at: "DESC" } }
  )) as any[]

  res.json({
    designs: designs.map((d) => ({
      id: d.id,
      organisation_id: d.organisation_id,
      name: d.name,
      code: d.code,
      thumbnail_url: d.thumbnail_url,
      is_active: d.is_active,
      created_at: d.created_at,
    })),
  })
}
