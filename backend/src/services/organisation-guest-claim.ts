import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { writeAudit } from "../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import { isEmailVerified } from "../lib/email-verification"
import { planGuestMembershipClaim } from "../lib/org-guest-claim"
import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"
import { applyOrganisationTier, dropOrganisationTier } from "./organisation-tier"

const normEmail = (email: unknown) => String(email ?? "").trim().toLowerCase()

/**
 * Move the organisation memberships of guest records with this account's email
 * onto the account (see lib/org-guest-claim.ts). Call only once the account's
 * email is confirmed. Never throws: confirming an email must not fail on it.
 */
export async function claimGuestMemberships(
  container: MedusaContainer,
  account: { id: string; email?: string | null }
): Promise<number> {
  const email = normEmail(account.email)
  if (!account.id || !email) return 0
  try {
    const customers = container.resolve(Modules.CUSTOMER) as any
    const orgs = container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
    const guests: any[] = await customers.listCustomers({ email, has_account: false })
    if (!guests.length) return 0
    const guestMemberships: any[] = await orgs.listOrganisationMembers({ customer_id: guests.map((g) => g.id) } as any)
    if (!guestMemberships.length) return 0
    const own: any[] = await orgs.listOrganisationMembers({ customer_id: account.id } as any)
    const moves = planGuestMembershipClaim(guestMemberships, own.map((m) => m.organisation_id))
    for (const m of moves) {
      await orgs.updateOrganisationMembers([{ id: m.id, customer_id: account.id }] as any)
      await dropOrganisationTier(container, m.organisation_id, [m.customer_id])
      await applyOrganisationTier(container, m.organisation_id, [account.id])
      await writeAudit({
        container: container as any,
        entity: AUDIT_ENTITY.ORGANISATION,
        entity_id: m.organisation_id,
        action: AUDIT_ACTION.MEMBER_ADDED,
        details: { customer_id: account.id, from_customer_id: m.customer_id, via: "email_confirmed" },
      })
    }
    return moves.length
  } catch (err) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[org] guest membership claim failed for ${account.id}: ${(err as Error)?.message}`)
    return 0
  }
}

/**
 * Staff picking a guest record for someone who already has a confirmed login
 * would give the login nothing: use the login instead. Otherwise unchanged.
 */
export async function preferAccountCustomerId(container: MedusaContainer, customerId: string): Promise<string> {
  try {
    const customers = container.resolve(Modules.CUSTOMER) as any
    const picked = await customers.retrieveCustomer(customerId)
    const email = normEmail(picked?.email)
    if (!picked || picked.has_account || !email) return customerId
    const accounts: any[] = await customers.listCustomers({ email, has_account: true })
    return accounts.find(isEmailVerified)?.id ?? customerId
  } catch {
    return customerId
  }
}
