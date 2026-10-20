import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { drainPendingStageEvents } from "../lib/stage-events"

/**
 * Re-emits stage events that failed to reach the bus when a writer saved a
 * stage (review 3-10). Always-on housekeeping: with nothing queued the
 * UPDATE matches no rows and the job is a no-op.
 */
export default async function drainPendingStageEventsJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const r = await drainPendingStageEvents(container)
    if (r.orders > 0) {
      logger.info(
        `drain-pending-stage-events: ${r.orders} order(s), ${r.emitted} emitted, ${r.failed} re-queued`
      )
    }
  } catch (err: any) {
    logger.error(`drain-pending-stage-events: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "drain-pending-stage-events",
  schedule: "*/10 * * * *",
}
