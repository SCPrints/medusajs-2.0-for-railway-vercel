import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { requireMembership } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/[id]/members
 *
 * Any member can list the roster. Returns each member with their
 * customer record hydrated (email + name) — for the Members tab UI.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)

  const members = (await service.listOrganisationMembers(
    { organisation_id: membership.organisation_id } as any,
    { take: 200, order: { accepted_at: "DESC" } }
  )) as any[]

  if (members.length === 0) {
    return res.json({ members: [] })
  }

  const customerIds = Array.from(new Set(members.map((m) => m.customer_id)))
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const customerById: Record<string, any> = {}
  try {
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: customerIds },
    })
    for (const c of data ?? []) customerById[c.id] = c
  } catch {
    /* graph unavailable — fall back to nulls */
  }

  res.json({
    members: members.map((m) => ({
      id: m.id,
      customer_id: m.customer_id,
      role: m.role,
      accepted_at: m.accepted_at,
      invited_by: m.invited_by,
      customer: customerById[m.customer_id]
        ? {
            id: customerById[m.customer_id].id,
            email: customerById[m.customer_id].email ?? null,
            first_name: customerById[m.customer_id].first_name ?? null,
            last_name: customerById[m.customer_id].last_name ?? null,
          }
        : null,
    })),
  })
}

/**
 * POST /store/customers/me/organisations/[id]/members  { email, role }
 * Same as POST …/invites: nobody is added without accepting an emailed
 * invitation from the matching, email-confirmed account.
 */
export { POST } from "../invites/route"
