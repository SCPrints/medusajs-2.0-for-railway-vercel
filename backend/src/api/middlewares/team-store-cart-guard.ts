import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { TEAM_STORE_CART_ONLY_MESSAGE, cartTeamStoreId, isBulkTeamStoreCart, isTeamStoresEnabled } from "../../lib/team-store"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import { TEAM_STORE_MODULE } from "../../modules/team-store"

async function cartLines(req: MedusaRequest): Promise<Array<{ metadata?: Record<string, unknown> | null }>> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "cart", filters: { id: req.params.id }, fields: ["id", "items.metadata"] })
  return data?.[0]?.items ?? []
}

/**
 * Decision 4: a team-store cart holds only that store's items. Every other
 * add route (core line-items, scp, bundles, embroidery, samples) refuses
 * while the cart has a team-store line. Judged from the lines (server-
 * stamped), not cart.metadata, which the browser can write.
 */
export async function refuseAddsToTeamStoreCart(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (!isTeamStoresEnabled() || !req.params?.id) return next()
  try {
    if (cartTeamStoreId(await cartLines(req))) {
      res.status(409).json({ type: "not_allowed", code: "team_store_cart", message: TEAM_STORE_CART_ONLY_MESSAGE })
      return
    }
  } catch {
    // The add route reports a missing cart itself.
  }
  next()
}

/**
 * Decision 3, bulk delivery: the order ships to the club with every other
 * order of the store, so the shipping address is the store's delivery
 * address whatever the buyer typed. The buyer's name and phone stay on it so
 * the club can hand out the bags.
 */
export async function forceTeamStoreBulkAddress(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const bodies = [req.body, (req as { validatedBody?: unknown }).validatedBody].filter(
    (b): b is { shipping_address?: Record<string, unknown> } => !!b && typeof b === "object" && "shipping_address" in (b as object)
  )
  if (!isTeamStoresEnabled() || !bodies.length || !req.params?.id) return next()
  try {
    const lines = await cartLines(req)
    const storeId = cartTeamStoreId(lines)
    if (!storeId || !isBulkTeamStoreCart(lines)) return next()
    const store = await (req.scope.resolve(TEAM_STORE_MODULE) as any).retrieveTeamStore(storeId)
    if (!store.delivery_destination_id) return next()
    const dest = await (req.scope.resolve(ORGANISATION_MODULE) as any).retrieveOrganisationDestination(store.delivery_destination_id)
    for (const body of bodies) {
      const typed = (body.shipping_address ?? {}) as Record<string, unknown>
      body.shipping_address = {
        first_name: typed.first_name ?? null,
        last_name: typed.last_name ?? null,
        phone: typed.phone ?? null,
        company: dest.name,
        address_1: dest.address_1,
        address_2: dest.address_2 ?? null,
        city: dest.city,
        province: dest.province ?? null,
        postal_code: dest.postal_code,
        country_code: dest.country_code ?? "au",
      }
    }
  } catch {
    // Never block checkout on this; staff see the address on the order.
  }
  next()
}
