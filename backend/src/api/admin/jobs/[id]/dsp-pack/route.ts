import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { getDspPack } from "../../../../../services/dsp-pack/build"
import { buildDspProofPdf } from "../../../../../services/dsp-pack/pdf"

/**
 * GET /admin/jobs/:id/dsp-pack — the DSP job pack (lib/dsp-job.ts): printIQ
 * copy-paste text, artwork links and warnings per garment group.
 * `?format=pdf` returns the art proof stamped on DSP's template instead.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const pack = await getDspPack(req.scope, req.params.id)
    if (req.query.format !== "pdf") return res.json(pack)
    if (!pack.packs.length) return res.status(404).json({ error: "No screen or Supacolour positions on this job." })
    const pdf = await buildDspProofPdf(pack.packs, { po: pack.po, customer: pack.customer, dueDate: pack.due_date })
    const name = `SCP-${pack.po}_${pack.customer}`.replace(/[^\w.-]+/g, "_").slice(0, 80)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${name}_DSP_proof.pdf"`)
    return res.send(pdf)
  } catch (err: any) {
    if (err instanceof MedusaError && err.type === MedusaError.Types.NOT_FOUND) {
      return res.status(404).json({ error: err.message })
    }
    return res.status(500).json({ error: err?.message ?? "failed to build DSP pack" })
  }
}
