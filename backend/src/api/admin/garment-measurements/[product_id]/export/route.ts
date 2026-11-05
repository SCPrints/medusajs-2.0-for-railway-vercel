import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { buildExport } from "../../../../../lib/garment-measurements"
import { loadProductMeasurements } from "../../../../../services/garment-measurements/load"

/**
 * GET /admin/garment-measurements/:product_id/export
 * `{ <size>: { <key>: number, ... } }` — the taped-file shape the 3D scripts read
 * (save it and point TAPE_FILE at it). Estimated sizes carry `_inferred: true`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { product, garment_type, rows } = await loadProductMeasurements(req, req.params.product_id)
  res.json({
    _note: `${product.title} (${product.handle}), ${garment_type}. Flat measurements in cm from the SC Prints admin, exported ${new Date().toISOString().slice(0, 10)}.`,
    ...buildExport(garment_type, rows),
  })
}
