import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { itemVariants } from "../../../../../../../lib/team-store"
import { TEAM_STORE_MODULE } from "../../../../../../../modules/team-store"
import { loadProductsByHandle } from "../../../../../../../services/team-store/catalog"
import { storefrontBase } from "../../../../../../../services/team-store/run"
import { signTeamStore } from "../../../../../../../services/team-store/sign"

/**
 * GET /admin/team-stores/:id/items/:item_id/design-link → { url }
 *
 * Opens the staff Studio in quote mode with the ITEM id as `quote_id` and a
 * `team-store-design:` signature. The Studio posts back to
 * /store/quotes/:id/design-items, which hands `tsitem_` ids to the team-store
 * relay (services/team-store/design-items.ts) — no customiser changes.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const item = await service.retrieveTeamStoreItem(req.params.item_id)
  if (item.team_store_id !== req.params.id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Item not found")
  const product = (await loadProductsByHandle(req.scope, [item.product_handle])).get(item.product_handle)
  const variant = product ? itemVariants({ ...item, allowed_sizes: null }, product.variants)[0] : null

  const params = new URLSearchParams()
  params.set("quote_id", item.id)
  params.set("qsig", signTeamStore("design", item.id))
  params.set("group", item.id)
  params.set("handle", item.product_handle)
  if (variant) params.set("variant", variant.id)
  res.json({ url: `${storefrontBase()}/customizer?${params.toString()}` })
}
