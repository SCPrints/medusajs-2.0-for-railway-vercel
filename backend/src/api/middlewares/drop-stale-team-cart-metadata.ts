import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { dropStaleTeamCartMetadata } from "../../lib/team-cart-metadata"

/**
 * POST /store/carts/:id/complete: clear team-order notes whose lines were
 * removed, so the order never carries them (lib/team-cart-metadata.ts).
 * Never blocks checkout: on any error the cart completes as it is.
 */
export async function dropStaleTeamCartMetadataMiddleware(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  try {
    const cartModule = req.scope.resolve(Modules.CART) as any
    const cart = await cartModule.retrieveCart(req.params.id, { select: ["id", "metadata"], relations: ["items"] })
    const cleaned = dropStaleTeamCartMetadata(cart?.metadata, cart?.items)
    if (cleaned) await cartModule.updateCarts(cart.id, { metadata: cleaned })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`drop stale team cart metadata failed for ${req.params.id}`, error)
  }
  next()
}
