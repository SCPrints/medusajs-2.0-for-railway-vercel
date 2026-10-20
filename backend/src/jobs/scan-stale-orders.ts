import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { STALE_ORDER_ALERTS_ENABLED } from "../lib/constants"
import { scanAcceptedQuotes } from "../services/attention/accepted-quotes"
import { scanStaleOrders } from "../services/stale-orders/scan"

/**
 * Daily scan at 08:00 UTC (~18:00 AEST).
 *
 * 1. Accepted quotes with no order after 1 business day → task + staff
 *    email (always on: it's one precise signal, never a batch).
 * 2. Stale orders — opt-in via STALE_ORDER_ALERTS_ENABLED. Stamps
 *    `metadata.is_stale` on orders whose production_stage hasn't advanced in
 *    N days; clears the flag when staff move the order forward.
 */
export default async function scanStaleOrdersJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const accepted = await scanAcceptedQuotes(container)
    logger.info(
      `scan-stale-orders: accepted quotes considered=${accepted.considered}, flagged_no_order=${accepted.flagged}`
    )
  } catch (err: any) {
    logger.error(`scan-stale-orders: accepted-quote sweep failed: ${err?.message ?? err}`)
  }

  if (!STALE_ORDER_ALERTS_ENABLED) {
    logger.info("scan-stale-orders: STALE_ORDER_ALERTS_ENABLED not 'true' — skipping order scan.")
    return
  }
  try {
    const result = await scanStaleOrders(container)
    const notify = result.notify
    const notifyBits = notify
      ? `, tasks_created=${notify.tasks_created}, owners_notified=${notify.owners_notified}, managers_escalated=${notify.managers_escalated}`
      : ""
    logger.info(
      `scan-stale-orders: considered=${result.considered}, newly_stale=${result.newly_stale.length}, cleared=${result.cleared}${notifyBits}`
    )
  } catch (err: any) {
    logger.error(`scan-stale-orders: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "scan-stale-orders",
  schedule: "0 8 * * *",
}
