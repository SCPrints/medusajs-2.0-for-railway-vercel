import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { isTeamStoresEnabled } from "../lib/team-store"
import { runTeamStoreHousekeeping } from "../services/team-store/run"

/**
 * Hourly team-store housekeeping (services/team-store/run.ts): approved
 * stores open at `opens_at`, open stores close at `closes_at` (run quote +
 * summary emails + under-minimum flag), finished runs complete. No-op until
 * TEAM_STORES_ENABLED.
 */
export default async function closeTeamStoresJob(container: MedusaContainer) {
  if (!isTeamStoresEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const r = await runTeamStoreHousekeeping(container)
    if (r.opened || r.closed || r.completed) logger.info(`close-team-stores: opened ${r.opened}, closed ${r.closed}, completed ${r.completed}`)
  } catch (err: any) {
    logger.error(`close-team-stores failed: ${err?.message ?? err}`)
  }
}

export const config = { name: "close-team-stores", schedule: "5 * * * *" }
