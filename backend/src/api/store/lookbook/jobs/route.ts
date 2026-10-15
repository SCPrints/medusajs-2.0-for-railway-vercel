import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  filterLookbookJobs,
  loadPublishedJobs,
  toPublicJob,
} from "../../../../lib/lookbook-jobs"

/**
 * Published lookbook jobs (one card per job, not per photo).
 *   ?product_handle=  jobs where any photo links that garment (PDP strip)
 *   ?tag=             jobs tagged e.g. "trades" (industry pages)
 *   ?limit=           default 200 (no filter = all jobs, used by the sitemap)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1),
    500
  )
  const productHandle = req.query.product_handle
    ? String(req.query.product_handle)
    : undefined
  const tag = req.query.tag ? String(req.query.tag) : undefined

  const all = await loadPublishedJobs(req.scope)
  const matched = filterLookbookJobs(all, { productHandle, tag })

  res.json({
    count: matched.length,
    jobs: matched.slice(0, limit).map(toPublicJob),
  })
}
