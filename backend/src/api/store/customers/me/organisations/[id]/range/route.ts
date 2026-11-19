import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { PACKING_OPTIONS } from "../../../../../../../lib/roster"
import { listRangeItems } from "../../../../../../../services/org-range"
import { requireMembership } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/:id/range
 *   → { items: [{ design_id, name, thumbnail_url, product: { id, handle, title, thumbnail } | null,
 *                 garment_group, base_colour, colours, variants: [{ id, colour, size }],
 *                 ready, not_ready_reason }],
 *       packing_options: [{ key, label }], can_order }
 *
 * The organisation's range = every saved design shared with it. Any member
 * may see it; owner / purchaser may order from it.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  res.json({
    items: await listRangeItems(req.scope, membership.organisation_id),
    packing_options: PACKING_OPTIONS,
    can_order: membership.role !== "viewer",
  })
}
