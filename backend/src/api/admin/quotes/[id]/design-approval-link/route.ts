import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { signQuoteApproval } from "../../../../../services/quote-approval/sign"

/**
 * GET /admin/quotes/:id/design-approval-link
 *   → { url }
 *
 * Returns the signed public URL staff send the customer so they can review the
 * mockup(s) designed in the Studio and Approve / Request changes. Mirrors the
 * accept-link route; the signature is deterministic (same URL every call).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: "id required" })

  const sig = signQuoteApproval(id)
  const storefrontUrl =
    process.env.STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:8000"
  const country = (
    process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au"
  ).toLowerCase()
  const url = `${storefrontUrl}/${country}/quote-approval/${encodeURIComponent(
    id
  )}?sig=${sig}`
  res.json({ url })
}
