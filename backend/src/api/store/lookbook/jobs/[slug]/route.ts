import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  loadPublishedJobs,
  relatedLookbookJobs,
  resolveLookbookProducts,
  toPublicJob,
} from "../../../../../lib/lookbook-jobs"

/** One job: every photo, the garments used (live PDPs only) and related jobs. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const all = await loadPublishedJobs(req.scope)
  const job = all.find((j) => j.slug === req.params.slug)
  if (!job) {
    return res.status(404).json({ message: "Job not found" })
  }

  const byHandle = await resolveLookbookProducts(req.scope, job.product_handles)

  res.json({
    job: {
      ...toPublicJob(job),
      images: job.tiles.map((t) => ({
        id: t.id,
        image_url: t.image_url,
        attribution: t.attribution,
      })),
      products: job.product_handles
        .map((h) => byHandle.get(h))
        .filter(Boolean),
    },
    related: relatedLookbookJobs(job, all).map(toPublicJob),
  })
}
