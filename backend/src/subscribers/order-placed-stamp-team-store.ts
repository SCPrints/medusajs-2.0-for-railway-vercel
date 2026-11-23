import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { mergeOrderMetadata } from "../lib/order-metadata"

/**
 * A team-store order carries `metadata.team_store_id` (+ title, closing date)
 * so the Jobs list can hide it behind the store's run and the customer's
 * order page can say when it prints. Read from the lines, which the cart
 * route stamped server-side.
 */
export default async function orderPlacedStampTeamStore({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  if (!data?.id) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: orders } = await query.graph({ entity: "order", filters: { id: data.id }, fields: ["id", "metadata", "items.metadata"] })
  const order = orders?.[0]
  const line = (order?.items ?? []).find((i: any) => typeof i?.metadata?.team_store_id === "string")
  if (!line || order.metadata?.team_store_id) return
  const m = line.metadata
  try {
    await mergeOrderMetadata(container, data.id, {
      team_store_id: m.team_store_id,
      team_store_title: m.team_store_title ?? null,
      team_store_closes_at: m.team_store_closes_at ?? null,
    })
  } catch (err: any) {
    container.resolve(ContainerRegistrationKeys.LOGGER).error(`order.placed team-store stamp failed for ${data.id}: ${err?.message ?? err}`)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
