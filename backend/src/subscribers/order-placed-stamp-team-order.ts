import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { mergeOrderMetadata } from "../lib/order-metadata"
import { teamOrderFromMetadata } from "../lib/roster"
import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"
import { raiseAttention } from "../services/attention/notify"

/**
 * Copies a team order's details from the cart to the order: `roster` (who
 * gets what), `packing`, `personalisation_requested` and `organisation_id`.
 * completeCartWorkflow already copies cart metadata, so this mostly CLEANS it
 * (the browser can write cart metadata): the roster is re-shaped and capped,
 * packing must be a known choice, and an `organisation_id` the customer isn't
 * a member of is removed. Names / numbers asked for → staff are flagged to
 * price them (nothing was charged).
 */
export default async function orderPlacedStampTeamOrderHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ["id", "display_id", "customer_id", "email", "cart_id", "metadata"],
    })
    const order = orders?.[0] as
      | { id: string; display_id?: number; customer_id?: string | null; email?: string | null; cart_id?: string | null; metadata?: Record<string, unknown> | null }
      | undefined
    if (!order) return

    // The order's own copy, else the cart's (a Medusa version that stops copying).
    let source = order.metadata ?? {}
    const KEYS = ["roster", "packing", "personalisation_requested", "organisation_id"]
    if (!KEYS.some((k) => k in source) && order.cart_id) {
      const { data: carts } = await query.graph({
        entity: "cart",
        filters: { id: order.cart_id },
        fields: ["id", "metadata"],
      })
      source = ((carts?.[0] as { metadata?: Record<string, unknown> | null } | undefined)?.metadata ?? {})
    }
    if (!KEYS.some((k) => k in source)) return

    const team = teamOrderFromMetadata(source)
    if (team.organisation_id) {
      const service = container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
      const member = order.customer_id
        ? await service.listOrganisationMembers(
            { customer_id: order.customer_id, organisation_id: team.organisation_id } as any,
            { take: 1 }
          )
        : []
      if (!member[0]) team.organisation_id = null
    }

    const patch: Record<string, unknown> = {}
    const unset: string[] = []
    const put = (key: string, value: unknown) => (value ? (patch[key] = value) : unset.push(key))
    put("organisation_id", team.organisation_id)
    put("roster", team.roster)
    put("packing", team.packing)
    put("personalisation_requested", team.personalisation_requested)
    await mergeOrderMetadata(container, orderId, patch, { unset })

    if (team.personalisation_requested) {
      await raiseAttention(container, {
        kind: "names_numbers_requested",
        order_id: orderId,
        customer_id: order.customer_id ?? null,
        label: `#${order.display_id ?? orderId}`,
        from: order.email ?? null,
        subject: "Names / numbers on the garments",
        excerpt: team.roster
          ? `${team.roster.total} ${team.roster.total === 1 ? "person" : "people"} on the roster.`
          : "No roster attached — ask the customer for the names.",
      })
    }
  } catch (err) {
    logger.error(`order.placed team-order stamp failed for ${orderId}: ${(err as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
