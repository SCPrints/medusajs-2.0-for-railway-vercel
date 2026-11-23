import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { adminStoreView, itemBodySchema, itemFields, parseBody } from "../../../../../services/team-store/admin"

/** POST /admin/team-stores/:id/items — add a garment + colour. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = parseBody(itemBodySchema, req.body)
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  await service.createTeamStoreItems({ team_store_id: store.id, ...(await itemFields(req.scope, store.id, body)) })
  res.status(201).json(await adminStoreView(req.scope, store.id))
}
