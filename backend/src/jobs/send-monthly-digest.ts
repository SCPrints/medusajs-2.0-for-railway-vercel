import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { sendMonthlyDigest } from "../services/monthly-digest/send-digest"

/**
 * Sends the monthly performance digest to every configured recipient on
 * the 2nd of each month at 22:00 UTC (≈ 09:00 AEST in summer, 08:00 in
 * winter). The 2nd-of-month timing is intentional: the 1st often has
 * pending stage updates from end-of-month orders that nudge production
 * SLA numbers; waiting a day stabilises the snapshot.
 *
 * Skips quietly when MONTHLY_DIGEST_RECIPIENTS is unset.
 *
 * SCHEDULING NOTE — do NOT change this back to a monthly cron (`0 22 2 * *`).
 * Medusa's scheduler arms each job with a single `setTimeout(cb, msUntilNext)`.
 * Node clamps any delay over ~24.85 days (2^31-1 ms) to 1 ms and emits a
 * `TimeoutOverflowWarning`, so a true monthly cron fires immediately and
 * reschedules in a tight loop (the terminal-spam bug). Instead we run DAILY at
 * 22:00 UTC — a delay well under the ceiling — and gate to the 2nd in-handler.
 */
export default async function sendMonthlyDigestJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // Only actually run on the 2nd of the month (UTC). Every other day is a
  // cheap no-op return — the daily schedule exists solely to dodge the
  // setTimeout-overflow loop described above.
  if (new Date().getUTCDate() !== 2) {
    return
  }

  try {
    const result = await sendMonthlyDigest(container)
    if (result.recipients.length === 0) {
      logger.info(
        `send-monthly-digest: ${result.skipped || "no recipients"} — skipped.`
      )
      return
    }
    logger.info(
      `send-monthly-digest: sent ${result.sent}/${result.recipients.length} digest emails.`
    )
  } catch (err: any) {
    logger.error(`send-monthly-digest: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "send-monthly-digest",
  // Daily at 22:00 UTC — gated to the 2nd in-handler. NOT `0 22 2 * *`: a
  // monthly cron overflows Node's setTimeout (>24.85 days) and loops. See the
  // SCHEDULING NOTE above.
  schedule: "0 22 * * *",
}
