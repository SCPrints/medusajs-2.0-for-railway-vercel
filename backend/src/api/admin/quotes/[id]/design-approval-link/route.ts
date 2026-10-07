import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { QUOTE_MODULE } from "../../../../../modules/quote"
import type QuoteModuleService from "../../../../../modules/quote/service"
import { EmailTemplates } from "../../../../../modules/email-notifications/templates"
import { z } from "zod"

import { SUPPORT_REPLY_TO_EMAIL } from "../../../../../lib/constants"
import { buildQuoteDecorations } from "../../../../../lib/quote-decorations"
import { buildQuoteMockups } from "../../../../../lib/quote-mockups"
import { signQuoteAccept } from "../../../../../services/quote-accept/sign"
import { signQuoteApproval } from "../../../../../services/quote-approval/sign"

const postSchema = z.object({
  /** Staff note shown in the email (e.g. "please send higher-res artwork"). */
  note: z.string().max(2000).optional(),
  /** Also include the priced lines, total and the accept-and-pay button. */
  include_quote: z.boolean().optional(),
})

function buildAcceptUrl(id: string): string {
  const storefrontUrl =
    process.env.STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:8000"
  const country = (
    process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au"
  ).toLowerCase()
  return `${storefrontUrl}/${country}/quote-accept/${encodeURIComponent(
    id
  )}?sig=${signQuoteAccept(id)}`
}

function buildApprovalUrl(id: string): string {
  const sig = signQuoteApproval(id)
  const storefrontUrl =
    process.env.STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:8000"
  const country = (
    process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au"
  ).toLowerCase()
  return `${storefrontUrl}/${country}/quote-approval/${encodeURIComponent(
    id
  )}?sig=${sig}`
}

/**
 * GET  /admin/quotes/:id/design-approval-link  → { url }
 *   The signed customer URL staff can copy/paste.
 *
 * POST /admin/quotes/:id/design-approval-link  body { note?, include_quote? }
 *   → { ok, sent_to }
 *   Emails the customer the approval link (with the mockup images + decoration
 *   details) and an optional staff note. With `include_quote` it is the whole
 *   quote: priced lines, total and the accept-and-pay link — refused while any
 *   line is unpriced (an unpriced line falls back to the catalogue price on
 *   acceptance, so the customer would see a total that isn't the deal).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: "id required" })
  res.json({ url: buildApprovalUrl(id) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: "id required" })

  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (!quote.email || typeof quote.email !== "string") {
    return res.status(400).json({ error: "quote has no customer email" })
  }
  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid body" })
  }

  const mockups = buildQuoteMockups(quote)
  const url = buildApprovalUrl(id)
  const items: Array<Record<string, any>> = Array.isArray(quote.line_items?.items)
    ? quote.line_items.items
    : []
  let quoteBlock: Record<string, unknown> | null = null
  if (body.include_quote) {
    if (!items.length) {
      return res.status(400).json({ error: "The quote has no line items to send." })
    }
    if (items.some((li) => li?.unit_price == null)) {
      return res.status(400).json({
        error: "Price every line before sending the quote — an unpriced line falls back to the catalogue price on acceptance.",
      })
    }
    const lines = items.map((li) => ({
      title: String(li.title ?? "Item"),
      quantity: Number(li.quantity ?? 0),
      unitPrice: Number(li.unit_price),
      total: Number(li.total ?? Number(li.unit_price) * Number(li.quantity ?? 0)),
    }))
    const sum = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100
    quoteBlock = {
      lines,
      total: sum,
      currencyCode: String(quote.currency_code ?? "aud").toUpperCase(),
      acceptUrl: buildAcceptUrl(id),
      expiresAt: quote.expires_at ? new Date(quote.expires_at).toISOString() : null,
    }
  }
  const publicId = typeof quote.public_id === "string" ? quote.public_id : id

  try {
    const notificationModuleService: INotificationModuleService =
      req.scope.resolve(Modules.NOTIFICATION)
    await notificationModuleService.createNotifications({
      to: quote.email,
      channel: "email",
      template: EmailTemplates.QUOTE_DESIGN_APPROVAL_REQUEST,
      data: {
        // The Resend provider reads subject/replyTo from here — without it the
        // send fails (this button never had it before 2026-10-07).
        emailOptions: {
          subject: quoteBlock
            ? `Your SC PRINTS quote ${publicId}`
            : `Your design is ready to review — ${publicId}`,
          replyTo: SUPPORT_REPLY_TO_EMAIL ?? undefined,
        },
        approval: {
          firstName:
            typeof quote.contact_name === "string"
              ? quote.contact_name.split(" ")[0]
              : null,
          publicId,
          approvalUrl: url,
          mockupImages: mockups.map((m) => ({
            url: m.url,
            side: m.side,
            sideLabel: m.sideLabel,
          })),
          decorations: buildQuoteDecorations(quote).map((d) => ({
            label: d.side_label,
            method: d.method,
            detail: d.detail,
          })),
          staffNote: body.note?.trim() || null,
          quote: quoteBlock,
        },
      },
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "send_failed" })
  }

  // Best-effort timeline event so staff see the request went out.
  try {
    await service.createQuoteEvents([
      {
        quote_id: id,
        type: "status_changed",
        actor: "staff",
        body: {
          design_approval: "request_sent",
          to: quote.email,
          included_quote: Boolean(quoteBlock),
          note: body.note?.trim() || null,
        },
      },
    ])
  } catch {
    /* event log is best-effort */
  }

  res.json({ ok: true, sent_to: quote.email, has_mockups: mockups.length > 0 })
}
