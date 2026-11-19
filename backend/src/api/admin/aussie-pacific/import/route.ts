import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AUSSIEPACIFIC_MODULE } from "../../../../modules/aussiepacific"
import AussiePacificService from "../../../../modules/aussiepacific/service"
import { isLockSkipped, withSupplierLock } from "../../../../lib/supplier-sync-lock"
import { importAussiePacificStyles } from "../../../../services/supplier-catalog-sync/aussiepacific-import"

/**
 * POST /admin/aussie-pacific/import
 *
 * Imports selected AP products into Medusa (the same import the nightly
 * catalog sync uses for new styles).
 *
 * Body: { style_codes: string[] }
 * Returns: { imported: string[], skipped: string[], errors: Array<{ style_code, error }> }
 * 409 while the Aussie Pacific inventory sync / another import holds the lock.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let ap: AussiePacificService
  try {
    ap = req.scope.resolve(AUSSIEPACIFIC_MODULE) as AussiePacificService
  } catch {
    return res.status(503).json({
      error: "Aussie Pacific module not configured. Set AUSSIE_PACIFIC_API_TOKEN.",
    })
  }

  const body = req.body as { style_codes?: string[] }
  const styleCodes = (body.style_codes ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
  if (!styleCodes.length) {
    return res.status(400).json({ error: "body must contain style_codes[]" })
  }

  try {
    const result = await withSupplierLock(req.scope, "aussiepacific", () =>
      importAussiePacificStyles(req.scope, ap, styleCodes)
    )
    if (isLockSkipped(result)) {
      return res.status(409).json({
        error: "An Aussie Pacific sync or import is already running — try again in a few minutes.",
      })
    }
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? String(err) })
  }
}
