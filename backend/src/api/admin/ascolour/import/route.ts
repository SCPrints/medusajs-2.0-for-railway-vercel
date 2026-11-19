import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ASCOLOUR_MODULE } from "../../../../modules/ascolour"
import AsColourService from "../../../../modules/ascolour/service"
import { getSupplierImportState, startSupplierImport } from "../../../../lib/supplier-import-run"
import {
  importAsColourStyles,
  type AsColourImportResult,
} from "../../../../services/supplier-catalog-sync/ascolour-import"

/**
 * POST /admin/ascolour/import
 *
 * Imports selected AS Colour products into Medusa (the same import the
 * nightly catalog sync uses for new styles).
 *
 * Body: { styleCodes: string[] }
 * Replies 202 `{ started, started_at }` and runs off the request under the
 * `supplier-sync:ascolour` lock (409 while the inventory sync / backfill /
 * another import holds it); GET returns `{ in_progress, last_run }` where
 * `last_run.result` is `{ imported, skipped, errors: [{ styleCode, error }] }`
 * (review 2-8).
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(getSupplierImportState<AsColourImportResult>("ascolour"))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const scope = req.scope
  let ascolour: AsColourService
  try {
    ascolour = scope.resolve(ASCOLOUR_MODULE) as AsColourService
  } catch {
    return res.status(503).json({ error: "AS Colour module not configured." })
  }

  const body = req.body as { styleCodes?: string[] }
  const styleCodes = body.styleCodes
  if (!styleCodes?.length) {
    return res.status(400).json({ error: "body must contain styleCodes[]" })
  }

  await startSupplierImport<AsColourImportResult>(req, res, {
    supplier: "ascolour",
    label: "An AS Colour",
    scope: `${styleCodes.length} style${styleCodes.length === 1 ? "" : "s"}`,
    work: () => importAsColourStyles(scope, ascolour, styleCodes),
  })
}
