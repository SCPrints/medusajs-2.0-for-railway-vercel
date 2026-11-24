import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { orgTier } from "../lib/org-range-from-order"
import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"

/**
 * Put organisation members in the organisation's pricing tier group
 * ("Tier: Silver" …), so a colleague who joins prices like the account
 * holder. Only ever ADDS a group (a member's own better tier still wins:
 * the best-ranked group prices). Default: every member. Never throws —
 * joining must not fail on a pricing hiccup.
 */
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

    const ids =
      customerIds ??
      ((await orgs.listOrganisationMembers({ organisation_id: organisationId } as any, { take: 1000 })) as any[]).map(
        (m) => m.customer_id as string
      )
    if (!ids.length) return { tier: tier.slug, added: 0 }

    const customers = container.resolve(Modules.CUSTOMER) as any
    const [group] = await customers.listCustomerGroups({ name: tier.name }, { take: 1 })
    if (!group) {
      logger.warn(`[org-tier] no "${tier.name}" customer group; run seed-customer-tiers`)
      return { tier: tier.slug, added: 0 }
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "customer",
      filters: { id: ids },
      fields: ["id", "groups.id"],
    })
    const missing = ((data ?? []) as any[])
      .filter((c) => !(c.groups ?? []).some((g: any) => g?.id === group.id))
      .map((c) => ({ customer_id: c.id as string, customer_group_id: group.id as string }))
    if (missing.length) await customers.addCustomerToGroup(missing)
    return { tier: tier.slug, added: missing.length }
  } catch (error) {
    logger.error(`[org-tier] ${organisationId}: ${(error as Error)?.message}`)
    return { tier: null, added: 0 }
  }
}
