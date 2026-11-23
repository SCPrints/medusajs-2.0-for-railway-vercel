import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { adminStoreView } from "../../../../../services/team-store/admin"
import { closeTeamStore } from "../../../../../services/team-store/run"

/** POST /admin/team-stores/:id/close — close now (same as the hourly job at closes_at). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  if (store.status !== "open") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `The store is ${store.status}, not open.`)
  const result = await closeTeamStore(req.scope, store.id, { actor: (req as any).auth_context?.actor_id ?? "admin" })
  res.json({ ...(await adminStoreView(req.scope, store.id)), run: result.summary, under_minimum: result.under_minimum })
}
