import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { isStudioWeekend } from "../lib/business-days"
import { STAFF_JOBS_EMAIL_ENABLED } from "../lib/constants"
import { sendStaffJobsToday } from "../services/jobs/morning-email"

/**
 * Weekday mornings, 21:30 UTC = 08:30 Sydney in summer (07:30 in winter):
 * each admin who owns open jobs gets "Your jobs today" with a link into each
 * one. Off with STAFF_JOBS_EMAIL_ENABLED=false.
 */
export default async function sendStaffJobsTodayJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!STAFF_JOBS_EMAIL_ENABLED || isStudioWeekend(new Date())) return
  try {
    const r = await sendStaffJobsToday(container)
    logger.info(`send-staff-jobs-today: sent=${r.sent}, failed=${r.failed}`)
  } catch (err: any) {
    logger.error(`send-staff-jobs-today: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "send-staff-jobs-today",
  schedule: "30 21 * * *",
}
