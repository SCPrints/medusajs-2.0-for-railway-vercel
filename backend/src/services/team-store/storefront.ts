import type { MedusaContainer } from "@medusajs/framework/types"

import { buyerState, designMockups, itemVariants } from "../../lib/team-store"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import { TEAM_STORE_MODULE } from "../../modules/team-store"
import { loadProductsByHandle } from "./catalog"

export async function findStoreByHandle(container: MedusaContainer, handle: string): Promise<any | null> {
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const [store] = await service.listTeamStores({ handle }, { take: 1 })
  return store ?? null
}

/**
 * What a buyer (or the organiser approving it) sees: store details plus
 * active, priced items with mockups and buyable sizes. Never print files,
 * cost or the password hash.
 */
export async function publicStoreView(container: MedusaContainer, store: any, opts: { includeItems: boolean }) {
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const org = await (container.resolve(ORGANISATION_MODULE) as any).retrieveOrganisation(store.organisation_id).catch(() => null)
  const view = {
    id: store.id,
    handle: store.handle,
    title: store.title,
    intro: store.intro ?? null,
    banner_url: store.banner_url ?? null,
    accent_colour: store.accent_colour ?? null,
    opens_at: store.opens_at ?? null,
    closes_at: store.closes_at,
    status: store.status,
    state: buyerState(store, new Date()),
    delivery_mode: store.delivery_mode,
    organisation_name: org?.name ?? null,
    approved_at: store.approved_at ?? null,
    approved_by_name: store.approved_by_name ?? null,
  }
  if (!opts.includeItems) return { store: view, items: [] }

  const items: any[] = (await service.listTeamStoreItems({ team_store_id: store.id, is_active: true }, { take: 200, order: { weight: "ASC", created_at: "ASC" } }))
    .filter((i: any) => i.customizer_design && i.unit_price != null)
  const products = await loadProductsByHandle(container, items.map((i) => i.product_handle))
  return {
    store: view,
    items: items.flatMap((i) => {
      const p = products.get(i.product_handle)
      if (!p) return []
      const sizes = itemVariants(i, p.variants).map((v) => ({ variant_id: v.id, size: v.size }))
      if (!sizes.length) return []
      const mockups = designMockups(i.customizer_design)
      return [
        {
          id: i.id,
          title: p.title,
          product_handle: p.handle,
          colour: i.colour,
          unit_price: Number(i.unit_price),
          thumbnail: mockups[0] ?? p.thumbnail,
          mockups,
          sizes,
        },
      ]
    }),
  }
}
