import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { customerQuoteSummary } from "../../../../../../lib/customer-quotes"
import { buildQuoteDecorations } from "../../../../../../lib/quote-decorations"
import { buildQuoteJobBreakdown } from "../../../../../../lib/quote-job-breakdown"
import { buildQuoteMockups } from "../../../../../../lib/quote-mockups"
import { requireCustomer } from "../../../../../../lib/require-customer"
import { quoteOrderInfo, retrieveOwnedQuote } from "../../../../../../services/customer-quotes/load"

/**
 * GET /store/customers/me/quotes/:id → { quote }
 *
 * One of the customer's own quotes: lines, proof mockups, decorations and —
 * once accepted — its order and any unpaid card link. Someone else's quote is
 * a 404. Same customer-safe subset as the signed accept page.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const quote = await retrieveOwnedQuote(req.scope, customerId, req.params.id)
  if (!quote) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Quote not found.")

  const summary = customerQuoteSummary(quote, quote.line_items?.items)
  const priced = summary.status !== "waiting" && summary.status !== "cart"
  res.json({
    quote: {
      ...summary,
      contact_name: quote.contact_name ?? null,
      company: quote.company ?? null,
      mockups: buildQuoteMockups(quote).map((m) => ({ label: m.sideLabel, url: m.url })),
      decorations: buildQuoteDecorations(quote),
      // The pricer breakdown carries prices, so it waits until the quote is sent.
      job_breakdown: priced ? buildQuoteJobBreakdown(quote) : null,
      ...(summary.status === "accepted"
        ? await quoteOrderInfo(req.scope, customerId, quote)
        : { order: null, pay_url: null }),
    },
  })
}
