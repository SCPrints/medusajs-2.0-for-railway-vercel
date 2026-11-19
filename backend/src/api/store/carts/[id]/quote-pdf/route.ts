import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { summariseQuoteLines } from "../../../../../lib/customer-quotes"
import { LEAD_RELAY_REJECTED, readLeadRelay } from "../../../../../lib/lead-relay"
import { createQuoteFromCart } from "../../../../../lib/open-carts"
import { poNumberFromMetadata } from "../../../../../lib/po-number"
import { getPostHog } from "../../../../../lib/posthog"
import { buildQuoteDecorations } from "../../../../../lib/quote-decorations"
import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import type QuoteModuleService from "../../../../../modules/quote/service"
import { CART_QUOTE_VALID_DAYS, cartQuoteDoc } from "../../../../../services/customer-docs/cart-quote"
import { buildDocPdf } from "../../../../../services/customer-docs/pdf"

const num = (v: unknown): number | null => {
  const n = v && typeof v === "object" ? Number(v) : typeof v === "string" ? Number.parseFloat(v) : (v as number)
  return typeof n === "number" && Number.isFinite(n) ? n : null
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * POST /store/carts/:id/quote-pdf → application/pdf
 *
 * The cart's "Download a quote" button: a formal quote PDF of the cart as it
 * stands (lines, shipping if chosen, GST shown as included, valid 30 days),
 * saved as a `new` quote so staff can see it in Jobs. One quote per cart: a
 * changed cart updates it (see `refresh` in createQuoteFromCart).
 *
 * Emails nobody. Staff hear about the quote only if the customer then asks
 * for a proof ("Email me a proof / quote instead"). Guests can use it; the
 * cart needs an email. Storefront relay only, like the other lead routes.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!readLeadRelay(req).ok) return res.status(403).json(LEAD_RELAY_REJECTED)
  const cartId = String(req.params.id ?? "")
  if (!cartId.startsWith("cart_") || cartId.length > 80) return res.status(400).json({ message: "Invalid cart" })

  let result: Awaited<ReturnType<typeof createQuoteFromCart>>
  try {
    result = await createQuoteFromCart(req.scope, cartId, { source: "cart", actor: "customer", refresh: true, quiet: true })
  } catch (err: any) {
    return res.status(err?.status ?? 500).json({ message: err?.message ?? "Could not make the quote" })
  }

  const quoteService = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  const quote: any = await quoteService.retrieveQuote(result.quote_id)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id", "email", "currency_code", "metadata", "total", "tax_total", "shipping_total",
      "shipping_methods.name", "shipping_methods.amount",
      "shipping_address.company", "shipping_address.first_name", "shipping_address.last_name",
      "billing_address.company",
      "customer.first_name", "customer.last_name", "customer.company_name", "customer.metadata",
    ],
  })
  const cart = (data?.[0] ?? {}) as any
  const meta = (cart.metadata ?? {}) as Record<string, unknown>

  let organisation: string | null = null
  if (typeof meta.organisation_id === "string" && meta.organisation_id) {
    organisation = await (req.scope.resolve(ORGANISATION_MODULE) as any)
      .retrieveOrganisation(meta.organisation_id)
      .then((o: any) => (typeof o?.name === "string" ? o.name : null))
      .catch(() => null)
  }
  const person =
    [cart.customer?.first_name, cart.customer?.last_name].filter(Boolean).join(" ") ||
    [cart.shipping_address?.first_name, cart.shipping_address?.last_name].filter(Boolean).join(" ") ||
    quote.contact_name ||
    null
  const company =
    organisation || cart.customer?.company_name || cart.shipping_address?.company || cart.billing_address?.company || null

  const lines = summariseQuoteLines(quote.line_items?.items)
  const itemsTotal = round2(lines.reduce((s, l) => s + (l.total ?? 0), 0))
  const methods = (Array.isArray(cart.shipping_methods) ? cart.shipping_methods : []) as any[]
  const shippingAmount = methods.length
    ? num(cart.shipping_total) ?? round2(methods.reduce((s, m) => s + (num(m?.amount) ?? 0), 0))
    : 0
  const total = num(cart.total) ?? round2(itemsTotal + shippingAmount)
  const issuedAt = new Date()

  const pdf = await buildDocPdf(
    cartQuoteDoc({
      publicId: quote.public_id,
      issuedAt,
      currency: String(cart.currency_code ?? quote.currency_code ?? "aud"),
      to: [company, person, cart.email ?? quote.email].filter((s): s is string => typeof s === "string" && !!s),
      poNumber: poNumberFromMetadata(meta),
      lines,
      decorations: buildQuoteDecorations(quote),
      shipping: methods.length ? { name: String(methods[0]?.name ?? "Shipping"), amount: shippingAmount } : null,
      // Whatever the cart took off (promo codes), so the document always adds up.
      discount: Math.max(0, round2(itemsTotal + shippingAmount - total)),
      total,
      // Prices are GST-inclusive. A cart with no address yet has no tax lines, so
      // fall back to the GST inside the total (1/11) rather than printing $0.
      gst: cart.customer?.metadata?.tax_exempt === true ? 0 : (num(cart.tax_total) || round2(total / 11)),
    })
  )

  // What we put in writing, for staff (merge — update replaces the jsonb).
  await quoteService
    .updateQuotes({
      id: quote.id,
      metadata: {
        ...(quote.metadata ?? {}),
        cart_pdf: {
          issued_at: issuedAt.toISOString(),
          valid_until: new Date(issuedAt.getTime() + CART_QUOTE_VALID_DAYS * 86_400_000).toISOString(),
          total,
        },
      },
    } as any)
    .catch(() => undefined)

  getPostHog()?.capture({
    distinctId: cartId,
    event: "cart quote pdf downloaded",
    properties: { cart_id: cartId, quote_id: quote.id, public_id: quote.public_id, created: result.created, total },
  })

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="SC-Prints-quote-${quote.public_id}.pdf"`)
  res.setHeader("Content-Length", pdf.length)
  res.status(200).send(pdf)
}
