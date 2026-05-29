import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { captureEvent } from "../../../../lib/posthog"
import { getImageAuditState, runImageAudit } from "../../../../services/image-audit/run"

/**
 * On-demand product-image liveness scan, backing the "Scan images" button
 * in /app/product-data → Browse & manage.
 *
 *   GET  → current scan state (in_progress + last run summary)
 *   POST → kick off a scan in the background, return immediately
 *
 * A full-catalog HEAD sweep takes minutes — far longer than an HTTP
 * request should hold open — so POST fires the run without awaiting and
 * returns `{ started: true }`. The backend is a long-lived Fly process
 * (min 1 machine), so the detached promise completes fine; the admin
 * re-applies the "Broken image" filter once it finishes. Unlike the
 * weekly cron, this works regardless of `IMAGE_AUDIT_ENABLED` — an
 * explicit click is consent to hit the external CDNs.
 */

const bodySchema = z.object({
  brand_id: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50000).optional(),
})

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(getImageAuditState())
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any

  if (getImageAuditState().in_progress) {
    res.json({ started: false, in_progress: true, ...getImageAuditState() })
    return
  }

  // Resolve the app-singleton deps up front so the detached run doesn't
  // touch the request scope after it's torn down.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = req.scope.resolve(Modules.PRODUCT) as any

  void runImageAudit(
    { query, productModule, logger },
    {
      source: "manual",
      brandId: body.brand_id,
      limit: body.limit,
      capture: (event, props) => captureEvent("admin", event, props),
    }
  ).catch((err: any) => {
    logger.warn(`image-audit (manual) failed: ${err?.message ?? err}`)
  })

  res.json({ started: true, in_progress: true, scope: body.brand_id ? `brand:${body.brand_id}` : "all" })
}
