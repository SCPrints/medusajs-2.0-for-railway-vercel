import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"

/**
 * Sharing a customer-owned row (saved design, artwork) with one of the
 * customer's organisations. Rows carry `customer_id` (owner) and a nullable
 * `organisation_id`; members of that organisation see them read-only.
 */

export type CustomerOrg = {
  organisation_id: string
  organisation_name: string
  role: "owner" | "purchaser" | "viewer"
}

export type SharedFrom = { organisation_id: string; organisation_name: string } | null

/** Roles that may share their own designs / artwork with an organisation. */
export const SHARE_ROLES: ReadonlyArray<CustomerOrg["role"]> = ["owner", "purchaser"]

/** Organisations the customer belongs to, with their role and the org's name. */
export async function listCustomerOrgs(
  scope: MedusaContainer,
  customerId: string
): Promise<CustomerOrg[]> {
  const service = scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const members = (await service.listOrganisationMembers(
    { customer_id: customerId } as any,
    { take: 200 }
  )) as any[]
  if (members.length === 0) return []
  const orgs = (await service.listOrganisations(
    { id: members.map((m) => m.organisation_id) } as any,
    { take: 200 }
  )) as any[]
  const nameById = new Map(orgs.map((o) => [o.id as string, o.name as string]))
  return members
    .filter((m) => nameById.has(m.organisation_id))
    .map((m) => ({
      organisation_id: m.organisation_id,
      organisation_name: nameById.get(m.organisation_id) ?? "",
      role: m.role,
    }))
}

/** Filter for "my rows + rows shared to any of my organisations". */
export function visibleToCustomerFilter(customerId: string, orgs: CustomerOrg[]) {
  if (orgs.length === 0) return { customer_id: customerId }
  return {
    $or: [
      { customer_id: customerId },
      { organisation_id: orgs.map((o) => o.organisation_id) },
    ],
  }
}

/** Can this customer see the row? (own, or shared to one of their orgs) */
export function isVisibleTo(
  row: { customer_id: string; organisation_id?: string | null },
  customerId: string,
  orgs: CustomerOrg[]
): boolean {
  if (row.customer_id === customerId) return true
  return !!row.organisation_id && orgs.some((o) => o.organisation_id === row.organisation_id)
}

/**
 * `can_edit` + `shared_from` for a visible row. `shared_from` is set only on
 * rows someone else shared to me (the org it came through); my own rows —
 * shared or not — get null and carry the target in `organisation_id`.
 */
export function sharingFields(
  row: { customer_id: string; organisation_id?: string | null },
  customerId: string,
  orgs: CustomerOrg[]
): { can_edit: boolean; shared_from: SharedFrom } {
  if (row.customer_id === customerId) return { can_edit: true, shared_from: null }
  const org = orgs.find((o) => o.organisation_id === row.organisation_id)
  return {
    can_edit: false,
    shared_from: org
      ? { organisation_id: org.organisation_id, organisation_name: org.organisation_name }
      : null,
  }
}

/**
 * Throw unless the customer may share into `organisationId`: not a member →
 * 404 (org ids aren't enumerable), member without owner/purchaser → 403.
 */
export function assertCanShareTo(orgs: CustomerOrg[], organisationId: string): void {
  const membership = orgs.find((o) => o.organisation_id === organisationId)
  if (!membership) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organisation not found.")
  }
  if (!SHARE_ROLES.includes(membership.role)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Sharing requires one of: ${SHARE_ROLES.join(", ")}.`
    )
  }
}
