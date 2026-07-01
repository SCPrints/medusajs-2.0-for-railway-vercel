import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { z } from "zod"

import { SUPPORT_REPLY_TO_EMAIL } from "../../../../../lib/constants"
import { EmailTemplates } from "../../../../../modules/email-notifications/templates"
import {
  generateReceiptPdf,
  loadReceiptOrder,
} from "../../../../../services/order-receipt-pdf/service"
import { writeAudit } from "../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { captureEvent } from "../../../../../lib/posthog"

const bodySchema = z.object({
  email: z.string().email().optional(),
})

/**
 * POST /admin/orders/:id/email-invoice
 *   body: { email? }   ← defaults to the order's own email
 *   → { ok: true, to }
 *
 * Re-sends the tax invoice to the customer: generates the same branded PDF
 * the order-placed subscriber attaches, and sends it via the dedicated
 * TAX_INVOICE email template. Staff use this when a customer never received
 * the original, gave the wrong address, or just needs another copy.
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

  const targetEmail = body.email?.trim() || order.email
  if (!targetEmail) {
    return res
      .status(400)
      .json({ error: "order has no email; provide one to send the invoice" })
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

  try {
    await notification.createNotifications({
      to: targetEmail,
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
  } catch (err: any) {
    return res
      .status(502)
      .json({ error: err?.message ?? "failed to send invoice" })
  }

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.EMAIL_SENT,
    actor_id: actor,
    details: { source: "tax_invoice_resend", to: targetEmail },
  })

  try {
    captureEvent(actor ?? "system", "order_invoice_emailed", {
      order_id: orderId,
      to: targetEmail,
    })
  } catch {
    /* best-effort */
  }

  return res.json({ ok: true, to: targetEmail })
}
