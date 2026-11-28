import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { rangeItemPriceBreaks } from "../../../../../../../../services/org-range"
import { requireMembership } from "../../../_helpers"

/**
 * GET /store/customers/me/organisations/:id/range/price-breaks
 *   → { currency_code, breaks: { [design_id]: [{ min_quantity, unit_price }] } }
 *
 * What one garment of each range item costs this member at 1, 10, 20, 50 and
 * 100 garments (their tier, GST included), so the order form can show a price
 * before any quantity is typed. Reads only.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  res.json({
    currency_code: "aud",
    breaks: await rangeItemPriceBreaks(req.scope, membership.organisation_id, membership.customer_id),
  })
}
