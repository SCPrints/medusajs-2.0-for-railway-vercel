import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { TEAM_STORE_MODULE } from "../../modules/team-store"

/** Every active item has a design and a price; bulk stores have an address. Throws the first gap. */
export async function assertStoreReady(container: MedusaContainer, store: any): Promise<any[]> {
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const items: any[] = (await service.listTeamStoreItems({ team_store_id: store.id }, { take: 200 })).filter((i: any) => i.is_active)
  if (!items.length) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Add at least one item first.")
  const undesigned = items.filter((i) => !i.customizer_design)
  if (undesigned.length) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Design every item first (${undesigned.length} without a design).`)
  const unpriced = items.filter((i) => i.unit_price == null || Number(i.unit_price) <= 0)
  if (unpriced.length) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Price every item first (${unpriced.length} without a price).`)
  if (store.delivery_mode === "bulk" && !store.delivery_destination_id) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Pick the club's delivery address for bulk delivery.")
  }
  return items
}
