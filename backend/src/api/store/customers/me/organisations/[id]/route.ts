import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../modules/organisation/service"
import { requireMembership } from "../_helpers"

/**
 * GET /store/customers/me/organisations/[id]
 *
 * Returns the organisation + the caller's role. Used by the storefront
 * org detail page to render header + gate UI affordances. 404 if not a
 * member.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const organisation = (await service.retrieveOrganisation(
    membership.organisation_id
  )) as any
  // Strip server-only fields the customer doesn't need
  const safeOrg = {
    id: organisation.id,
    handle: organisation.handle,
    name: organisation.name,
    contact_email: organisation.contact_email,
    contact_phone: organisation.contact_phone,
    notes: organisation.notes,
    tax_exempt: organisation.tax_exempt,
    metadata: organisation.metadata,
  }
  res.json({ organisation: safeOrg, role: membership.role })
}
