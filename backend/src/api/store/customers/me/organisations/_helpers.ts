import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../modules/organisation/service"

export type OrgMembership = {
  customer_id: string
  organisation_id: string
  role: "owner" | "purchaser" | "viewer"
  member_id: string
}

export type Role = OrgMembership["role"]

/**
 * Authenticate + check membership on a `:id` route. Returns the
 * membership row on success, throws on failure.
 *
 * - No JWT → 401
 * - Not a member of `:id` → 404 (per CLAUDE.md auth convention,
 *   org IDs aren't enumerable, so don't 403)
 */
export async function requireMembership(
  req: AuthenticatedMedusaRequest
): Promise<OrgMembership> {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not authenticated.")
  }
  const orgId = req.params?.id
  if (!orgId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organisation not found.")
  }
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const matches = await service.listOrganisationMembers(
    { customer_id: customerId, organisation_id: orgId } as any,
    { take: 1 }
  )
  const row = matches[0] as any
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organisation not found.")
  }
  return {
    customer_id: customerId,
    organisation_id: orgId,
    role: row.role,
    member_id: row.id,
  }
}

/**
 * Require one of the listed roles. Throws 403 if the membership exists
 * but doesn't have an allowed role.
 */
export function requireRole(
  membership: OrgMembership,
  allowed: ReadonlyArray<Role>
): void {
  if (!allowed.includes(membership.role)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Action requires one of: ${allowed.join(", ")}.`
    )
  }
}
