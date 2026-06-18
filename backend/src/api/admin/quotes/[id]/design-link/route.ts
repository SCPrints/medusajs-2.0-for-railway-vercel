import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { signQuoteDesign } from "../../../../../services/quote-design/sign"

/**
 * GET /admin/quotes/:id/design-link?group=<groupId>&handle=<productHandle>
 *   → { url }
 *
 * Mints the signed storefront customiser URL that opens the real Studio in
 * "quote mode". The popup relays the finished design back to
 * /store/quotes/:id/design-items (via the storefront /api/quote-bridge relay),
 * which verifies the `qsig` before appending the lines.
 *
 * - `group` re-edits an existing design group on the quote (the post-back
 *   replaces every line carrying that group_id). Omit it to start a fresh
 *   design group.
 * - `handle` pre-selects a product by handle (the standalone customiser reads
 *   `?handle=`). Omit it to let staff pick the product inside the Studio.
 *
 * Mirrors the POS `openCustomizer` URL build (same STOREFRONT_URL +
 * STOREFRONT_DEFAULT_COUNTRY_CODE env). The signature is deterministic.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: "id required" })

  const group = typeof req.query.group === "string" ? req.query.group : ""
  const handle = typeof req.query.handle === "string" ? req.query.handle : ""

  const sig = signQuoteDesign(id)
  const storefrontUrl =
    process.env.STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:8000"
  const country = (
    process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au"
  ).toLowerCase()

  const params = new URLSearchParams()
  params.set("quote_id", id)
  params.set("qsig", sig)
  if (group) params.set("group", group)
  if (handle) params.set("handle", handle)

  const url = `${storefrontUrl}/${country}/customizer?${params.toString()}`
  res.json({ url })
}
