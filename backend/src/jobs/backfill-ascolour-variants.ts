import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ASCOLOUR_MODULE } from "../modules/ascolour"
import { withSupplierLock } from "../lib/supplier-sync-lock"
import backfillAsColourVariants from "../scripts/backfill-ascolour-variants"

/**
 * Daily backfill of any AS Colour variants that drifted from the live API.
 *
 * Background: the original importer is create-only by product handle, so when
 * AS Colour adds new colours to an existing style (or new sizes), they never
 * land in our DB without manual intervention. This cron runs the same
 * reconcile logic as the one-shot script (src/scripts/backfill-ascolour-variants.ts)
 * — diffs SKUs per product, creates only what's missing, seeds inventory.
 * Existing variants are never touched, so cart/order references stay intact.
 *
 * Schedule: 06:30 UTC (16:30 AEST) — runs after the hourly inventory sync
 * has had multiple ticks to settle and well before peak Australian browsing.
 *
 * No-ops when the AS Colour module isn't registered (no API token) instead of
 * failing daily, and takes the same `supplier-sync:ascolour` lock as the
 * inventory sync + admin import so it can't create variants mid-import.
 */
export default async function handler(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    container.resolve(ASCOLOUR_MODULE)
  } catch {
    logger.warn("AS Colour module not registered — skipping variant backfill.")
    return
  }
  // The script's exported function expects `{ container, args }` (ExecArgs
  // shape). The job runtime hands us just the container — feed it through.
  await withSupplierLock(container, "ascolour", () =>
    backfillAsColourVariants({ container, args: [] } as any)
  )
}

export const config = {
  name: "backfill-ascolour-variants",
  schedule: "30 6 * * *",
}
