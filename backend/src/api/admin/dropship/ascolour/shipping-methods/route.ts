import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ASCOLOUR_MODULE } from "../../../../../modules/ascolour"
import type AsColourService from "../../../../../modules/ascolour/service"

/**
 * GET /admin/dropship/ascolour/shipping-methods
 *
 * Returns AS Colour's own list of valid dropship shipping methods
 * (GET /orders/shippingmethods → { code, name, description }[]) so the admin
 * UI can offer a picker instead of a free-text box. The order payload's
 * `shippingMethod` must be one of these `code`s — a typed label like
 * "Standard" is rejected by AS Colour with a 400.
 *
 * Never throws: returns { methods: [], error } so the UI can fall back to a
 * free-text input when the module is unconfigured or AS Colour is unreachable.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let ascolour: AsColourService
  try {
    ascolour = req.scope.resolve(ASCOLOUR_MODULE) as AsColourService
  } catch {
    return res.json({
      methods: [],
      default: null,
      error: "AS Colour module not configured.",
    })
  }

  try {
    const methods = await ascolour.getClient().getShippingMethods()
    return res.json({
      methods: Array.isArray(methods) ? methods : [],
      default: ascolour.getOptions().default_shipping_method ?? null,
    })
  } catch (err: any) {
    return res.json({
      methods: [],
      default: ascolour.getOptions().default_shipping_method ?? null,
      error: String(err?.message ?? err),
    })
  }
}
