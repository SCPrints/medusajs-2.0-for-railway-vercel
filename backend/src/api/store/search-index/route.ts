import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { activeSearchIndexName } from "../../../lib/search-index"

/**
 * GET /store/search-index → { products: "products_v3" }
 *
 * The Meilisearch index the storefront should query. The Search Module
 * renames the index on every rebuild, so the storefront can't hard-code it.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const products = await activeSearchIndexName(req.scope, "products")
  res.setHeader("Cache-Control", "public, max-age=30")
  res.json({ products })
}
