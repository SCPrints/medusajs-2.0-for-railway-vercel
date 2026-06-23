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
    // AS Colour wraps list responses in a PaginatedResponse ({ items|data|
    // results }), not a bare array — every other AS Colour list call in the
    // codebase unwraps the same way. Normalise key casing too, since we
    // haven't seen this endpoint's exact item shape yet.
    const raw: any = await ascolour.getClient().getShippingMethods()
    const rawList: any[] = Array.isArray(raw)
      ? raw
      : (raw?.items ?? raw?.data ?? raw?.results ?? [])
    const methods = rawList
      .map((m: any) => ({
        code: String(m?.code ?? m?.Code ?? m?.value ?? m?.id ?? "").trim(),
        name: String(
          m?.name ?? m?.Name ?? m?.label ?? m?.description ?? m?.code ?? m?.Code ?? ""
        ).trim(),
        description: m?.description ?? m?.Description ?? undefined,
      }))
      .filter((m: { code: string }) => m.code.length > 0)
    return res.json({
      methods,
      default: ascolour.getOptions().default_shipping_method ?? null,
      // Temporary diagnostic: the raw AS Colour shape, so an unexpected
      // wrapper/casing is visible without another blind deploy. Remove once
      // the dropdown is confirmed populated.
      debug_raw: Array.isArray(raw)
        ? raw.slice(0, 3)
        : {
            type: raw && typeof raw === "object" ? "object" : typeof raw,
            topKeys: raw && typeof raw === "object" ? Object.keys(raw) : null,
            sample: rawList.slice(0, 3),
          },
    })
  } catch (err: any) {
    return res.json({
      methods: [],
      default: ascolour.getOptions().default_shipping_method ?? null,
      error: String(err?.message ?? err),
    })
  }
}
