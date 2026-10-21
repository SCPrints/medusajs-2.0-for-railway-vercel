import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { getJob } from "../../../../services/jobs/build"

/**
 * GET /admin/jobs/:id — the job read model (lib/job-view.ts). `:id` is an
 * order id, quote id, quote public id ("Q-…") or order display number.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const job = await getJob(req.scope, req.params.id)
    return res.json({ job })
  } catch (err: any) {
    if (err instanceof MedusaError && err.type === MedusaError.Types.NOT_FOUND) {
      return res.status(404).json({ error: err.message })
    }
    return res.status(500).json({ error: err?.message ?? "failed to build job" })
  }
}
