import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { suggestItemPrice } from "../../../../../../../services/team-store/catalog"

/** GET — the pricing engine's price at the store's expected quantity, plus garment cost. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await suggestItemPrice(req.scope, req.params.item_id))
}
