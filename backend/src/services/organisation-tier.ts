import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { orgTier } from "../lib/org-range-from-order"
import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"

/**
 * Organisation pricing tiers. Members are put in the organisation's tier
 * group ("Tier: Silver" …) so a colleague who joins prices like the account
 * holder (the best-ranked group prices). Which group an organisation added is
 * recorded on the customer (`metadata.org_tier_groups = { <org_id>: <group_id> }`),
 * so leaving the organisation, or the organisation changing tier, removes only
 * that grant — never a tier staff gave the customer themselves. Never throws:
 * joining or leaving must not fail on a pricing hiccup.
 */
export const ORG_TIER_KEY = "org_tier_groups"

const grantsOf = (c: any): Record<string, string> => {
  const g = c?.metadata?.[ORG_TIER_KEY]
  return g && typeof g === "object" && !Array.isArray(g) ? (g as Record<string, string>) : {}
}

async function memberIds(container: MedusaContainer, organisationId: string): Promise<string[]> {
  const orgs = container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  return ((await orgs.listOrganisationMembers({ organisation_id: organisationId } as any, { take: 1000 })) as any[]).map(
    (m) => m.customer_id as string
  )
}

async function loadCustomers(container: MedusaContainer, ids: string[]) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", filters: { id: ids }, fields: ["id", "metadata", "groups.id"] })
  return (data ?? []) as any[]
}

/** Put members (default: all) in the organisation's tier group and record the grant. */
export async function applyOrganisationTier(
  container: MedusaContainer,
  organisationId: string,
  customerIds?: string[]
): Promise<{ tier: string | null; added: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const orgs = container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
    const org: any = await orgs.retrieveOrganisation(organisationId)
    const tier = orgTier(org?.default_pricing_tier)
    if (!tier) return { tier: null, added: 0 }

    const ids = customerIds ?? (await memberIds(container, organisationId))
    if (!ids.length) return { tier: tier.slug, added: 0 }

    const customers = container.resolve(Modules.CUSTOMER) as any
    const [group] = await customers.listCustomerGroups({ name: tier.name }, { take: 1 })
    if (!group) {
      logger.warn(`[org-tier] no "${tier.name}" customer group; run seed-customer-tiers`)
      return { tier: tier.slug, added: 0 }
    }
    const rows = await loadCustomers(container, ids)
    const hasGroup = (c: any) => (c.groups ?? []).some((g: any) => g?.id === group.id)
    const missing = rows.filter((c) => !hasGroup(c))
    if (missing.length) {
      await customers.addCustomerToGroup(missing.map((c) => ({ customer_id: c.id as string, customer_group_id: group.id as string })))
    }
    // Record the grant when we added the group, or when another organisation's
    // grant put it there (so leaving that one doesn't take it). A group the
    // customer had on their own is never recorded: it stays theirs.
    const record = rows.filter(
      (c) => grantsOf(c)[organisationId] !== group.id && (!hasGroup(c) || Object.values(grantsOf(c)).includes(group.id))
    )
    for (const c of record) {
      await customers.updateCustomers(c.id, {
        metadata: { ...(c.metadata ?? {}), [ORG_TIER_KEY]: { ...grantsOf(c), [organisationId]: group.id } },
      })
    }
    return { tier: tier.slug, added: missing.length }
  } catch (error) {
    logger.error(`[org-tier] ${organisationId}: ${(error as Error)?.message}`)
    return { tier: null, added: 0 }
  }
}

/**
 * Take back the tier this organisation granted (member left, or the
 * organisation's tier changed). Kept when another organisation the customer
 * belongs to granted the same group. Default: every member.
 */
export async function dropOrganisationTier(
  container: MedusaContainer,
  organisationId: string,
  customerIds?: string[]
): Promise<{ removed: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const ids = customerIds ?? (await memberIds(container, organisationId))
    if (!ids.length) return { removed: 0 }
    const customers = container.resolve(Modules.CUSTOMER) as any
    const rows = (await loadCustomers(container, ids)).filter((c) => grantsOf(c)[organisationId])
    const remove: Array<{ customer_id: string; customer_group_id: string }> = []
    const metaUpdates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    for (const c of rows) {
      const grants = grantsOf(c)
      const groupId = grants[organisationId]
      const { [organisationId]: _gone, ...rest } = grants
      metaUpdates.push({ id: c.id, metadata: { ...(c.metadata ?? {}), [ORG_TIER_KEY]: rest } })
      if (!Object.values(rest).includes(groupId) && (c.groups ?? []).some((g: any) => g?.id === groupId)) {
        remove.push({ customer_id: c.id, customer_group_id: groupId })
      }
    }
    if (remove.length) await customers.removeCustomerFromGroup(remove)
    for (const u of metaUpdates) await customers.updateCustomers(u.id, { metadata: u.metadata })
    return { removed: remove.length }
  } catch (error) {
    logger.error(`[org-tier] drop ${organisationId}: ${(error as Error)?.message}`)
    return { removed: 0 }
  }
}
