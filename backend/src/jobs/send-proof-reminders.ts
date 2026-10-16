import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { isStudioWeekend } from "../lib/business-days"
import { PROOF_REMINDERS_ENABLED } from "../lib/constants"
import { sendProofReminders } from "../services/artwork-approval/proof-reminders"

/**
 * Weekday mornings at 08:30 Sydney (22:30 UTC the day before): re-send the
 * artwork-approval email to customers who haven't answered their proof within
 * PROOF_REMINDER_BUSINESS_DAYS. One reminder per proof round. Opt-in via
 * PROOF_REMINDERS_ENABLED.
 */
export default async function sendProofRemindersJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!PROOF_REMINDERS_ENABLED) {
    logger.info("send-proof-reminders: PROOF_REMINDERS_ENABLED not 'true' — skipping.")
    return
  }
  if (isStudioWeekend(new Date())) return
  try {
    const r = await sendProofReminders(container)
    logger.info(
      `send-proof-reminders: considered=${r.considered}, sent=${r.sent}, failed=${r.failed}`
    )
  } catch (err: any) {
    logger.error(`send-proof-reminders: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "send-proof-reminders",
  schedule: "30 22 * * *",
}
