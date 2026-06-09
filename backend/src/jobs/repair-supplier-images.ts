import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { captureEvent } from "../lib/posthog"
import { revalidateStorefrontTags } from "../lib/storefront-revalidate"
import repairAsColourImages from "../scripts/repair-ascolour-images"
import scrapeAsColourWebsiteImages from "../scripts/scrape-ascolour-website-images"

/**
 * Weekly supplier-image SELF-HEAL.
 *
 * Supplier CDNs rot externally — AS Colour re-uploads imagery and BigCommerce
 * mints new hashed URLs while purging the old files, so URLs that were live at
 * import time 404 later (2026-06-10: 10 products, ~35 dead URLs, unnoticed for
 * ~3 weeks because the storefront's image cache masked it). Detection alone
 * (the image audit) still requires a human to run the repair; this job closes
 * the loop so nobody has to come back and fix images by hand:
 *
 *   1. repair-ascolour-images — removes confirmed-dead (404/410) URLs and
 *      recovers live size-variants from the API. Repair-only by design: every
 *      write goes through the `writeProductImages` guard, transient errors
 *      never remove anything, and a product is never reduced to zero images.
 *   2. scrape-ascolour-website-images — append-only + HEAD-validated; fills
 *      colour views the API lost from the ascolour.com website CDN.
 *   3. Purge the storefront product cache so repaired URLs go live (HARD RULE
 *      #6 — image writes don't auto-fire revalidation).
 *
 * Both scripts are idempotent and skip-healthy, so steady-state runs are
 * cheap (~10-15 min, network-bound). Sunday 19:00 UTC — after the 17:00
 * image audit, so the audit's "broken" stamps reflect pre-heal state and the
 * following week's audit confirms the heal.
 *
 * Off by default; opt in with `IMAGE_AUTO_REPAIR_ENABLED=true`. Scoped to AS
 * Colour today because that's the only supplier with both observed rot and a
 * recovery source — extend per supplier as their rot patterns emerge.
 */
export default async function repairSupplierImagesJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (process.env.IMAGE_AUTO_REPAIR_ENABLED !== "true") {
    logger.info(
      "repair-supplier-images: skipped (set IMAGE_AUTO_REPAIR_ENABLED=true to enable the weekly self-heal)"
    )
    return
  }

  const startedAt = Date.now()
  let repairFailed = false
  let scrapeFailed = false

  try {
    await repairAsColourImages({ container } as any)
  } catch (err: any) {
    repairFailed = true
    logger.error(
      `repair-supplier-images: repair step failed: ${err?.message ?? err}`
    )
  }

  try {
    await scrapeAsColourWebsiteImages({ container } as any)
  } catch (err: any) {
    scrapeFailed = true
    logger.error(
      `repair-supplier-images: scrape step failed: ${err?.message ?? err}`
    )
  }

  // Purge even after a partial failure — whichever step ran may have written.
  const purged = await revalidateStorefrontTags(["products"], logger)

  const seconds = Math.round((Date.now() - startedAt) / 1000)
  logger.info(
    `repair-supplier-images: done in ${seconds}s (repair=${repairFailed ? "FAILED" : "ok"}, scrape=${scrapeFailed ? "FAILED" : "ok"}, cache-purge=${purged ? "ok" : "skipped/failed"})`
  )
  captureEvent("system", "supplier_images_self_heal_completed", {
    duration_seconds: seconds,
    repair_failed: repairFailed,
    scrape_failed: scrapeFailed,
    cache_purged: purged,
  })
}

export const config = {
  name: "repair-supplier-images",
  schedule: "0 19 * * 0",
}
