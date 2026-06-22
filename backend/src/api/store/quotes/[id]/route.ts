import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { QUOTE_MODULE } from "../../../../modules/quote"
import type QuoteModuleService from "../../../../modules/quote/service"
import { buildQuoteMockups } from "../../../../lib/quote-mockups"
import { verifyQuoteAccept } from "../../../../services/quote-accept/sign"

/**
 * GET /store/quotes/:id?sig=...
 *   → public quote view (renders on the storefront accept page)
 *
 * Requires the HMAC signature. Returns a safe subset of the quote
 * (never the assigned_to actor, internal metadata, etc.) so the
 * customer can review before clicking Accept.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const sig = String((req.query?.sig as string) ?? "")
  if (!verifyQuoteAccept(id, sig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }
  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (quote.status === "accepted" || quote.status === "converted") {
    return res.json({
      status: quote.status,
      public_id: quote.public_id,
      already_accepted: true,
    })
  }
  if (quote.status === "lost" || quote.status === "expired") {
    return res
      .status(410)
      .json({ error: "expired", status: quote.status, public_id: quote.public_id })
  }
  return res.json({
    public_id: quote.public_id,
    status: quote.status,
    subject: quote.subject,
    contact_name: quote.contact_name,
    company: quote.company,
    message: quote.message,
    currency_code: quote.currency_code,
    total_estimate: quote.total_estimate,
    // Safe per-line subset for the customer: text + price + the mockup
    // thumbnail (so they see the garment/design they're accepting). The full
    // customizerDesign is deliberately NOT sent — it's large + internal.
    line_items: (
      (quote.line_items as { items?: Array<Record<string, any>> })?.items ?? []
    ).map((li) => ({
      title: typeof li?.title === "string" ? li.title : null,
      description: typeof li?.description === "string" ? li.description : null,
      quantity: li?.quantity ?? null,
      unit_price: li?.unit_price ?? null,
      total: li?.total ?? null,
      variant_id: typeof li?.variant_id === "string" ? li.variant_id : null,
      thumbnail: typeof li?.thumbnail === "string" ? li.thumbnail : null,
    })),
    // ALL Studio mockups across the quote (every print position, e.g. front +
    // back) so the accept page can show the customer exactly what they're
    // agreeing to — not just the first thumbnail.
    mockups: buildQuoteMockups(quote).map((m) => ({
      side: m.side,
      side_label: m.sideLabel,
      url: m.url,
    })),
    expires_at: quote.expires_at,
  })
}
