import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { getRunSummary } from "../../../../../services/team-store/run"

/**
 * GET /admin/team-stores/:id/run — size totals, buyers and order ids across
 * every non-cancelled order. Live while the store is open. The admin page
 * moves all of `order_ids` through /admin/orders/bulk/production-stage.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  res.json({ run: await getRunSummary(req.scope, store.id) })
}
