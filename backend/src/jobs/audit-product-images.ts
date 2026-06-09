import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { captureEvent } from "../lib/posthog"
import { runImageAudit } from "../services/image-audit/run"

/**
 * Weekly product-image liveness scan.
 *
 * HEAD-checks every product's thumbnail AND every gallery image, and stamps
 * `metadata.image_audit.status = "broken"` on the ones whose URLs no longer
 * resolve (supplier CDN rotated the file, a scraped/guessed URL was
 * wrong, hotlinking blocked, R2 object GC'd). The "Broken image"
 * data-quality flag in /app/product-data reads that stamp — the plain
 * "Missing image" flag can't catch these because the thumbnail field is
 * populated, just dead. Gallery scope is load-bearing: per-colour CDN rot
 * leaves the thumbnail healthy while that colour's PDP gallery + customizer
 * canvas break (2026-06-10 incident — dead ~3 weeks, found by a customer-
 * facing screen, not by us).
 *
 * Off by default (HEAD-checking the whole catalog hits external CDNs);
 * opt in with `IMAGE_AUDIT_ENABLED=true`. The on-demand "Scan images"
 * button in the admin works regardless of this gate — a click is consent.
 *
 * Sunday 17:00 UTC (03:00 AEST Mon) — a quiet slot clear of the other
 * crons, and 2h before the repair-supplier-images self-heal at 19:00. The
 * runner only writes products whose broken-ness changed, so steady-state
 * runs are cheap and don't trigger a reindex storm.
 */
export default async function auditProductImagesJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (process.env.IMAGE_AUDIT_ENABLED !== "true") {
    logger.info(
      "audit-product-images: skipped (set IMAGE_AUDIT_ENABLED=true to enable the weekly scan)"
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  await runImageAudit(
    { query, productModule, logger },
    {
      source: "cron",
      // Gallery scope multiplies URL volume (~27k urls over ~1.3k products);
      // 16 workers keeps the weekly sweep well under an hour while staying
      // gentle on the supplier CDNs.
      concurrency: 16,
      capture: (event, props) => captureEvent("system", event, props),
    }
  )
}

export const config = {
  name: "audit-product-images",
  schedule: "0 17 * * 0",
}
