import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { QUOTE_MODULE } from "../../../../../modules/quote"
import type QuoteModuleService from "../../../../../modules/quote/service"
import { STRIPE_PAYMENT_LINK_MODULE } from "../../../../../modules/stripe-payment-link"
import type StripePaymentLinkModuleService from "../../../../../modules/stripe-payment-link/service"
import { STRIPE_API_KEY } from "../../../../../lib/constants"
import { getPostHog } from "../../../../../lib/posthog"
import { notifyQuoteCustomerAction } from "../../../../../lib/notify-quote-action"
import { verifyQuoteAccept } from "../../../../../services/quote-accept/sign"
import { convertQuoteToOrder } from "../../../../../services/quote/convert"
import { createPaymentLink } from "../../../../../services/stripe-payment-link"

const schema = z.object({
  sig: z.string().min(16).max(64),
  approver_name: z.string().max(200).optional(),
})

/**
 * Card-payment link for the order the acceptance just created. Reuses an
 * open link on re-POST so a refresh never mints a second Stripe link.
 * Null when Stripe isn't configured or anything fails — the tax invoice
 * (bank details) still goes out, so payment is never blocked on this.
 */
const payUrlForOrder = async (
  req: MedusaRequest,
  orderId: string,
  displayId: number | string | null,
  quoteId: string
): Promise<string | null> => {
  if (!STRIPE_API_KEY) return null
  try {
    const links = req.scope.resolve(
      STRIPE_PAYMENT_LINK_MODULE
    ) as StripePaymentLinkModuleService
    const [open] = await links.listStripePaymentLinks(
      { order_id: orderId, status: "open" } as any,
      { order: { created_at: "DESC" }, take: 1 } as any
    )
    if (open?.url) return open.url as string

    const orderModule: IOrderModuleService = req.scope.resolve(Modules.ORDER)
    const order: any = await orderModule.retrieveOrder(orderId, {
      relations: ["summary"],
    })
    // Order aggregates come back 0 from retrieveOrder; the summary is reliable.
    const total = Number(
      order?.summary?.raw_current_order_total?.value ??
        order?.summary?.current_order_total ??
        0
    )
    const amountCents = Math.round(total * 100)
    if (!Number.isFinite(amountCents) || amountCents < 50) return null
    const link = await createPaymentLink(req.scope, {
      amountCents,
      currency: String(order.currency_code ?? "aud").toLowerCase(),
      scenario: "full",
      label: `Order #${displayId ?? ""}`.trim(),
      orderId,
      quoteId,
    })
    return link.url
  } catch {
    return null
  }
}

/**
 * POST /store/quotes/:id/accept
 *   body: { sig, approver_name? }
 *   → { ok: true, order_id, display_id, pay_url, lines_added, skipped_items }
 *
 * Accepting IS ordering: verifies the HMAC signature and converts the quote
 * straight into a real (unpaid) order at the quoted prices — the same
 * conversion as the admin "Convert to order" button. The order-placed email
 * sends the customer the tax invoice (bank details); `pay_url` is a Stripe
 * Payment Link for the order total so they can pay by card right away, and
 * the payment-link webhook marks the order paid.
 *
 * (Before 2026-10-16 this built a cart and sent the customer to checkout, so
 * an accepted quote whose cart was never paid never became an order.)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  if (!verifyQuoteAccept(id, body.sig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }

  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (quote.status === "lost" || quote.status === "expired") {
    return res
      .status(410)
      .json({ error: "quote no longer accepting", status: quote.status })
  }

  // Idempotency: the accept link is static and non-expiring, so a re-POST
  // (refresh, double-click) returns the existing order + its open pay link.
  const alreadyOrdered = async (q: any) => {
    const m = ((q?.metadata ?? {}) as Record<string, unknown>)
    if (typeof m.order_id !== "string" || !m.order_id) return null
    const displayId = (m.order_display_id as number | string) ?? null
    return {
      ok: true,
      order_id: m.order_id,
      display_id: displayId,
      pay_url: await payUrlForOrder(req, m.order_id, displayId, id),
      lines_added: 0,
      skipped_items: [],
      idempotent: true,
    }
  }
  const existing = await alreadyOrdered(quote)
  if (existing) return res.json(existing)

  // ---- Atomic conversion claim (prevents duplicate orders) ----
  // The check above is read-then-write; two concurrent POSTs would both pass
  // it and each create an order. Flip status to a transient "converting" in
  // ONE statement so only one POST proceeds. A 'converting' row older than
  // 5 min is a crashed prior attempt and may be re-claimed. (status is a plain
  // text column, so a transient value outside the model enum is fine.)
  const pg = req.scope.resolve<any>("__pg_connection__")
  if (pg?.raw) {
    let claimed = false
    try {
      const claim = await pg.raw(
        `update "quote"
            set status = 'converting', updated_at = now()
          where id = ?
            and deleted_at is null
            and coalesce(metadata->>'order_id', '') = ''
            and (status <> 'converting' or updated_at < now() - interval '5 minutes')
          returning id`,
        [id]
      )
      claimed = (claim?.rows?.length ?? 0) > 0
    } catch {
      // If the claim query itself fails, proceed anyway — losing the race guard
      // is better than blocking every acceptance.
      claimed = true
    }
    if (!claimed) {
      const fresh = await service.retrieveQuote(id).catch(() => null)
      const done = await alreadyOrdered(fresh)
      if (done) return res.json(done)
      return res.status(409).json({
        error: "acceptance_in_progress",
        detail:
          "This quote is already being accepted — try again in a moment.",
      })
    }
  }

  let result: Awaited<ReturnType<typeof convertQuoteToOrder>>
  try {
    result = await convertQuoteToOrder(req.scope, {
      quoteId: id,
      actorId: null,
      via: "customer",
      approverName: body.approver_name ?? null,
      fromStatus: quote.status,
    })
  } catch (err: any) {
    // Release the claim so the customer (or staff) can retry immediately.
    await service
      .updateQuotes([{ id, status: quote.status }])
      .catch(() => undefined)
    return res.status(500).json({
      error:
        "We couldn't place this order automatically. Reply to your quote email and we'll sort it out.",
      detail: String(err?.message ?? err),
    })
  }

  const payUrl = await payUrlForOrder(req, result.order_id, result.display_id, id)

  getPostHog()?.capture({
    distinctId: quote.email,
    event: "quote accepted",
    properties: {
      quote_id: id,
      public_id: quote.public_id,
      order_id: result.order_id,
      lines_added: result.lines_added,
      lines_skipped: result.skipped_items.length,
      has_pay_link: !!payUrl,
    },
  })

  // Email staff that the customer accepted — the order now exists.
  await notifyQuoteCustomerAction(req.scope, {
    quote,
    action: "quote_accepted",
    comment: null,
  })

  return res.json({
    ok: true,
    order_id: result.order_id,
    display_id: result.display_id,
    pay_url: payUrl,
    lines_added: result.lines_added,
    skipped_items: result.skipped_items,
  })
}
