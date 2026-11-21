import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { cleanBrandKit, readBrandKit } from "../../../../../../../lib/brand-kit"
import { CUSTOMER_ARTWORK_MODULE } from "../../../../../../../modules/customer-artwork"
import type CustomerArtworkModuleService from "../../../../../../../modules/customer-artwork/service"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { requireMembership, requireRole } from "../../_helpers"

/** Artwork shared with THIS organisation (the candidates for official logos). */
async function sharedArtwork(scope: AuthenticatedMedusaRequest["scope"], organisationId: string) {
  const service = scope.resolve<CustomerArtworkModuleService>(CUSTOMER_ARTWORK_MODULE)
  const rows = (await service.listCustomerArtworks(
    { organisation_id: organisationId, hidden_at: null } as any,
    { take: 300, order: { created_at: "DESC" } }
  )) as any[]
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, url: r.url as string, thumbnail_url: (r.thumbnail_url ?? null) as string | null }))
}

const payload = async (req: AuthenticatedMedusaRequest, organisationId: string, canEdit: boolean) => {
  const org = (await req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE).retrieveOrganisation(organisationId)) as any
  const kit = readBrandKit(org.brand_kit)
  const artwork = await sharedArtwork(req.scope, organisationId)
  return {
    brand_kit: kit,
    logos: artwork.filter((a) => kit.logo_artwork_ids.includes(a.id)),
    shared_artwork: artwork,
    can_edit: canEdit,
  }
}

/**
 * GET /store/customers/me/organisations/:id/brand-kit   (any member)
 *   → { brand_kit: { colours: [{ name, hex, pantone }], fonts, placement_notes, logo_artwork_ids },
 *       logos: [{ id, name, url, thumbnail_url }], shared_artwork: [same], can_edit }
 * 404 for anyone who isn't a member.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  res.json(await payload(req, membership.organisation_id, membership.role === "owner"))
}

/**
 * POST /store/customers/me/organisations/:id/brand-kit  { colours, fonts, placement_notes, logo_artwork_ids }
 *   → same as GET. Owner only (403 for others). 400 on a bad hex, too many
 *   items or a logo id that isn't artwork shared with this organisation.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const checked = cleanBrandKit(req.body)
  if ("error" in checked) throw new MedusaError(MedusaError.Types.INVALID_DATA, checked.error)
  const shared = new Set((await sharedArtwork(req.scope, membership.organisation_id)).map((a) => a.id))
  if (checked.kit.logo_artwork_ids.some((id) => !shared.has(id))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Logos must be artwork shared with your organisation.")
  }
  await req.scope
    .resolve<OrganisationModuleService>(ORGANISATION_MODULE)
    .updateOrganisations([{ id: membership.organisation_id, brand_kit: checked.kit } as any])
  res.json(await payload(req, membership.organisation_id, true))
}
