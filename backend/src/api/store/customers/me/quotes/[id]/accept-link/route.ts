import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { customerQuoteStatus } from "../../../../../../../lib/customer-quotes"
import { requireCustomer } from "../../../../../../../lib/require-customer"
import { retrieveOwnedQuote } from "../../../../../../../services/customer-quotes/load"
import { signQuoteAccept } from "../../../../../../../services/quote-accept/sign"

/**
 * POST /store/customers/me/quotes/:id/accept-link → { url, path }
 *
 * Mints the same signed accept link staff email, for the quote's owner, so
 * "Accept" in the account opens the existing accept page. The signature is
 * made here on the server; the accept routes still verify it as before.
 * Only for a quote that is ready to accept (sent, not expired).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const quote = await retrieveOwnedQuote(req.scope, customerId, req.params.id)
  if (!quote) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Quote not found.")
  if (customerQuoteStatus(quote).key !== "ready") {
    return res.status(409).json({ error: "not_ready", message: "This quote can't be accepted right now." })
  }
  const path = `/quote-accept/${encodeURIComponent(quote.id)}?sig=${signQuoteAccept(quote.id)}`
  const storefrontUrl = process.env.STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:8000"
  const country = (process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au").toLowerCase()
  res.json({ url: `${storefrontUrl}/${country}${path}`, path })
}
