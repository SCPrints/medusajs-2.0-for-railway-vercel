import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { QUOTE_MODULE } from "../../../../../modules/quote"
import type QuoteModuleService from "../../../../../modules/quote/service"
import { EmailTemplates } from "../../../../../modules/email-notifications/templates"
import { buildQuoteMockups } from "../../../../../lib/quote-mockups"
import { signQuoteApproval } from "../../../../../services/quote-approval/sign"

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
 * POST /admin/quotes/:id/design-approval-link  → { ok, sent_to }
 *   Emails the customer the same link directly (with the mockup images), so
 *   staff don't have to copy-and-send. Mirrors the order artwork-approval email.
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

  const mockups = buildQuoteMockups(quote)
  const url = buildApprovalUrl(id)

  try {
    const notificationModuleService: INotificationModuleService =
      req.scope.resolve(Modules.NOTIFICATION)
    await notificationModuleService.createNotifications({
      to: quote.email,
      channel: "email",
      template: EmailTemplates.QUOTE_DESIGN_APPROVAL_REQUEST,
      data: {
        approval: {
          firstName:
            typeof quote.contact_name === "string" ? quote.contact_name : null,
          publicId:
            typeof quote.public_id === "string" ? quote.public_id : id,
          approvalUrl: url,
          mockupImages: mockups.map((m) => ({
            url: m.url,
            side: m.side,
            sideLabel: m.sideLabel,
          })),
          staffNote: null,
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
        body: { design_approval: "request_sent", to: quote.email },
      },
    ])
  } catch {
    /* event log is best-effort */
  }

  res.json({ ok: true, sent_to: quote.email, has_mockups: mockups.length > 0 })
}
