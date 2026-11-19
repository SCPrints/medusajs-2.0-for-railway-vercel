import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FASHIONBIZ_MODULE } from "../../../../modules/fashionbiz"
import FashionBizService from "../../../../modules/fashionbiz/service"
import { FashionBizBrandSlug } from "../../../../modules/fashionbiz/types"
import { getSupplierImportState, startSupplierImport } from "../../../../lib/supplier-import-run"
import {
  importFashionBizStyles,
  type FashionBizImportResult,
} from "../../../../services/supplier-catalog-sync/fashionbiz-import"

/**
 * POST /admin/fashionbiz/import
 *
 * Imports selected FashionBiz products into Medusa (the same import the
 * nightly catalog sync uses for new styles).
 *
 * Body: { brand: string, slugs: string[] }
 * Replies 202 `{ started, started_at }` and runs off the request under the
 * `supplier-sync:fashionbiz` lock (409 while the inventory sync / another
 * import holds it); GET returns `{ in_progress, last_run }` where
 * `last_run.result` is `{ imported, skipped, errors: [{ slug, error }] }`
 * (review 2-8).
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(getSupplierImportState<FashionBizImportResult>("fashionbiz"))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const scope = req.scope
  let fashionbiz: FashionBizService
  try {
    fashionbiz = scope.resolve(FASHIONBIZ_MODULE) as FashionBizService
  } catch {
    return res.status(503).json({ error: "FashionBiz module not configured. Set FASHIONBIZ_API_TOKEN." })
  }

  const body = req.body as { brand?: string; slugs?: string[] }
  const brand = body.brand as FashionBizBrandSlug | undefined
  const slugs = body.slugs
  if (!brand || !slugs?.length) {
    return res.status(400).json({ error: "body must contain brand and slugs[]" })
  }

  await startSupplierImport<FashionBizImportResult>(req, res, {
    supplier: "fashionbiz",
    label: "A FashionBiz",
    scope: `${brand}: ${slugs.length} style${slugs.length === 1 ? "" : "s"}`,
    work: () => importFashionBizStyles(scope, fashionbiz, brand, slugs),
  })
}
