import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { captureEvent } from "../lib/posthog"
import { runImageAudit } from "../services/image-audit/run"

/**
 * Weekly product-image liveness scan.
 *
 * HEAD-checks every product's thumbnail and stamps
 * `metadata.image_audit.status = "broken"` on the ones whose URL no longer
 * resolves (supplier CDN rotated the file, a scraped/guessed URL was
 * wrong, hotlinking blocked, R2 object GC'd). The "Broken image"
 * data-quality flag in /app/product-data reads that stamp — the plain
 * "Missing image" flag can't catch these because the thumbnail field is
 * populated, just dead.
 *
 * Off by default (HEAD-checking the whole catalog hits external CDNs);
 * opt in with `IMAGE_AUDIT_ENABLED=true`. The on-demand "Scan images"
 * button in the admin works regardless of this gate — a click is consent.
 *
 * Sunday 17:00 UTC (03:00 AEST Mon) — a quiet slot clear of the other
 * crons. The runner only writes products whose broken-ness changed, so
 * steady-state runs are cheap and don't trigger a reindex storm.
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
      capture: (event, props) => captureEvent("system", event, props),
    }
  )
}

export const config = {
  name: "audit-product-images",
  schedule: "0 17 * * 0",
}
