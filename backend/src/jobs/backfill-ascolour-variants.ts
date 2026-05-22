import type { MedusaContainer } from "@medusajs/framework/types"

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
 */
export default async function handler(container: MedusaContainer) {
  // The script's exported function expects `{ container, args }` (ExecArgs
  // shape). The job runtime hands us just the container — feed it through.
  await backfillAsColourVariants({ container, args: [] } as any)
}

export const config = {
  name: "backfill-ascolour-variants",
  schedule: "30 6 * * *",
}
