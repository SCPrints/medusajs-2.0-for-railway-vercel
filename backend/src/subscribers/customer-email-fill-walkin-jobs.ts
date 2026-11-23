import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { isWalkInEmail } from "../lib/walk-in"
import { QUOTE_MODULE } from "../modules/quote"
import { bustTodayCache } from "../services/jobs/today"

/**
 * A walk-in or phone customer gives their email later and staff add it to the
 * customer. Their jobs and orders were created on the walk-in placeholder, so
 * job emails still went nowhere. Copy the real email onto every order and
 * quote of theirs still on the placeholder. Never throws.
 */
export default async function customerEmailFillWalkinJobs({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const customer = await (container.resolve(Modules.CUSTOMER) as any).retrieveCustomer(data.id)
    const email = typeof customer?.email === "string" ? customer.email.trim() : ""
    if (!email || isWalkInEmail(email)) return

    const orderModule = container.resolve(Modules.ORDER) as any
    const orders = await orderModule.listOrders({ customer_id: data.id }, { select: ["id", "email"], take: 500 })
    const stuckOrders = (orders as any[]).filter((o) => !o.email || isWalkInEmail(o.email))
    if (stuckOrders.length) await orderModule.updateOrders(stuckOrders.map((o) => ({ id: o.id, email })))

    const quotes = container.resolve(QUOTE_MODULE) as any
    const qs = await quotes.listQuotes({ customer_id: data.id }, { take: 500 })
    const stuckQuotes = (qs as any[]).filter((q) => !q.email || isWalkInEmail(q.email))
    if (stuckQuotes.length) await quotes.updateQuotes(stuckQuotes.map((q) => ({ id: q.id, email })))

    if (stuckOrders.length || stuckQuotes.length) {
      bustTodayCache()
      logger.info(`walk-in email: ${data.id} → ${stuckOrders.length} order(s), ${stuckQuotes.length} quote(s) now on their email`)
    }
  } catch (err: any) {
    logger.warn(`walk-in email fill failed for ${data?.id}: ${err?.message ?? err}`)
  }
}

export const config: SubscriberConfig = {
  event: "customer.updated",
}
