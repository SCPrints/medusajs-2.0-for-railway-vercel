import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { z } from "zod"

import { SUPPORT_REPLY_TO_EMAIL } from "../../../../../lib/constants"
import { parseNotificationEmailList } from "../../../../../lib/notification-recipients"
import { EmailTemplates } from "../../../../../modules/email-notifications/templates"
import {
  generateReceiptPdf,
  loadReceiptOrder,
} from "../../../../../services/order-receipt-pdf/service"
import { writeAudit } from "../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { captureEvent } from "../../../../../lib/posthog"

const bodySchema = z.object({
  email: z.string().optional(),
})

const singleEmail = z.string().email()

/**
 * POST /admin/orders/:id/email-invoice
 *   body: { email? }   ← comma-separated list; defaults to the order's own email
 *   → { ok: true, to: string[] }
 *
 * Re-sends the tax invoice: generates the same branded PDF the order-placed
 * subscriber attaches, and sends it via the dedicated TAX_INVOICE email
 * template — one email per recipient. Staff use this when a customer never
 * received the original, gave the wrong address, needs another copy, or wants
 * it cc'd to their accounts inbox.
 *
 * Not idempotent on purpose — staff can re-send as many times as needed.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid email" })
  }

  const actor = (req as any).auth_context?.actor_id ?? null
  const notification = req.scope.resolve(
    Modules.NOTIFICATION
  ) as INotificationModuleService

  const order = await loadReceiptOrder(req.scope, orderId)
  if (!order) {
    return res.status(404).json({ error: "order not found" })
  }

  const targets = parseNotificationEmailList(body.email)
  if (targets.length === 0 && order.email) {
    targets.push(order.email)
  }
  if (targets.length === 0) {
    return res
      .status(400)
      .json({ error: "order has no email; provide one to send the invoice" })
  }
  const invalid = targets.filter((t) => !singleEmail.safeParse(t).success)
  if (invalid.length > 0) {
    return res
      .status(400)
      .json({ error: `invalid email address: ${invalid.join(", ")}` })
  }

  const displayId =
    (order as { display_id?: string | number }).display_id ?? orderId

  let attachments
  try {
    const pdf = await generateReceiptPdf(order)
    attachments = [
      {
        filename: `tax-invoice-${displayId}.pdf`,
        content: pdf.toString("base64"),
        content_type: "application/pdf",
        disposition: "attachment" as const,
      },
    ]
  } catch (err: any) {
    return res
      .status(502)
      .json({ error: err?.message ?? "failed to generate invoice PDF" })
  }

  const currency = String(order.currency_code ?? "AUD").toUpperCase()
  const totalValue = order.total ?? 0
  const orderTotalFormatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(Number(totalValue))
  const orderDateFormatted = new Date(order.created_at).toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "short", year: "numeric" }
  )

  // One email per recipient (repo convention — same loop shape as the
  // merchant-inbox sends in order-placed.ts). PDF generated once above.
  const sent: string[] = []
  const failed: Array<{ to: string; error: string }> = []
  for (const to of targets) {
    try {
      await notification.createNotifications({
        to,
        channel: "email",
        template: EmailTemplates.TAX_INVOICE,
        attachments,
        data: {
          emailOptions: {
            replyTo: SUPPORT_REPLY_TO_EMAIL,
            subject: `Tax invoice for order #${displayId}`,
          },
          customerFirstName: order.shipping_address?.first_name ?? null,
          orderDisplayId: displayId,
          orderDateFormatted,
          orderTotalFormatted,
          preview: `Your tax invoice for order #${displayId} (PDF attached).`,
        },
      })
      sent.push(to)
    } catch (err: any) {
      failed.push({ to, error: err?.message ?? "failed to send" })
    }
  }

  if (sent.length === 0) {
    return res.status(502).json({
      error: `failed to send invoice: ${failed.map((f) => `${f.to} (${f.error})`).join("; ")}`,
    })
  }

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.EMAIL_SENT,
    actor_id: actor,
    details: {
      source: "tax_invoice_resend",
      to: sent.join(", "),
      ...(failed.length > 0
        ? { failed: failed.map((f) => f.to).join(", ") }
        : {}),
    },
  })

  try {
    captureEvent(actor ?? "system", "order_invoice_emailed", {
      order_id: orderId,
      to: sent.join(", "),
      recipient_count: sent.length,
    })
  } catch {
    /* best-effort */
  }

  return res.json({ ok: true, to: sent, failed })
}
