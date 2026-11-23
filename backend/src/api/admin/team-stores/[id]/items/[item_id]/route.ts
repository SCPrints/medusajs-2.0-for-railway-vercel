import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { TEAM_STORE_MODULE } from "../../../../../../modules/team-store"
import { adminStoreView, itemBodySchema, itemFields, parseBody } from "../../../../../../services/team-store/admin"

async function loadItem(req: MedusaRequest) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const item = await service.retrieveTeamStoreItem(req.params.item_id)
  if (item.team_store_id !== req.params.id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Item not found")
  return { service, item }
}

/** Edit an item. A price change applies to new cart adds only (carts keep theirs). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = parseBody(itemBodySchema.partial(), req.body)
  const { service, item } = await loadItem(req)
  await service.updateTeamStoreItems({ id: item.id, ...(await itemFields(req.scope, item.team_store_id, body)) })
  res.json(await adminStoreView(req.scope, item.team_store_id))
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { service, item } = await loadItem(req)
  await service.softDeleteTeamStoreItems(item.id)
  res.json(await adminStoreView(req.scope, item.team_store_id))
}
