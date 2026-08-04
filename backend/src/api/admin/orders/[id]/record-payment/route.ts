import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { markPaymentCollectionAsPaid } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { loadReceiptOrder } from "../../../../../services/order-receipt-pdf/service"
import { writeAudit } from "../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { captureEvent } from "../../../../../lib/posthog"

const bodySchema = z.object({
  amount_cents: z.coerce.number().int().min(1).optional(),
  method: z.enum(["bank_transfer", "cash", "other"]).default("bank_transfer"),
  reference: z.string().max(200).optional(),
})

/**
 * GET /admin/orders/:id/record-payment
 *   → { total, paid_total, balance_due, due_at, currency_code }
 *
 * Payment state for the tax-invoice widget — same derivation the invoice PDF
 * uses (loadReceiptOrder), so the widget and the PDF always agree.
 *
 * POST /admin/orders/:id/record-payment
 *   body: { amount_cents?, method?, reference? }
 *   → { ok: true, amount, method, balance_due }
 *
 * Records an offline payment (bank transfer landed in the ANZ account, cash
 * over the counter) against the order. Creates a fresh payment_collection and
 * runs markPaymentCollectionAsPaid — the exact shape the Stripe payment-link
 * webhook uses, so Medusa's payment_status updates the same way. Amount
 * defaults to the current balance due. Stamps `real_gateway = <method>` so
 * the payment-mix report buckets it.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const order = await loadReceiptOrder(req.scope, req.params.id)
  if (!order) return res.status(404).json({ error: "order not found" })
  res.json({
    total: order.total ?? 0,
    paid_total: order.paid_total ?? null,
    balance_due: order.balance_due ?? null,
    due_at: order.due_at ?? null,
    currency_code: String(order.currency_code ?? "AUD").toUpperCase(),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid body" })
  }

  const order = await loadReceiptOrder(req.scope, orderId)
  if (!order) return res.status(404).json({ error: "order not found" })

  const balance = typeof order.balance_due === "number" ? order.balance_due : null
  const amount =
    body.amount_cents !== undefined ? body.amount_cents / 100 : balance
  if (!amount || amount <= 0) {
    return res
      .status(400)
      .json({ error: "nothing owing — provide amount_cents to record anyway" })
  }

  const actor = (req as any).auth_context?.actor_id ?? null
  const currency = String(order.currency_code ?? "aud").toLowerCase()
  const paymentModule = req.scope.resolve(Modules.PAYMENT) as any
  const remoteLink = req.scope.resolve(
    ContainerRegistrationKeys.REMOTE_LINK
  ) as any

  // Fresh collection per recorded payment — markPaymentCollectionAsPaid
  // requires status "not_paid", so we can't append to the checkout's
  // collection (same reason the payment-link flow does this).
  const collection = await paymentModule.createPaymentCollections({
    amount,
    currency_code: currency,
    metadata: {
      real_gateway: body.method,
      recorded_by: actor,
      ...(body.reference ? { reference: body.reference } : {}),
    },
  })

  await remoteLink.create({
    [Modules.ORDER]: { order_id: orderId },
    [Modules.PAYMENT]: { payment_collection_id: collection.id },
  })

  await markPaymentCollectionAsPaid(req.scope).run({
    input: { payment_collection_id: collection.id, order_id: orderId },
  })

  // Tag the Payment row with the real gateway (the workflow hard-codes
  // pp_system_default) so the payment-mix report attributes it correctly.
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({
      entity: "payment_collection",
      filters: { id: collection.id },
      fields: ["id", "payments.id", "payments.metadata"],
    })
    const payment = data?.[0]?.payments?.[0]
    if (payment?.id) {
      await paymentModule.updatePayment({
        id: payment.id,
        metadata: {
          ...((payment.metadata as Record<string, unknown>) ?? {}),
          real_gateway: body.method,
          ...(body.reference ? { reference: body.reference } : {}),
        },
      })
    }
  } catch {
    /* attribution is best-effort; the payment itself is committed */
  }

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.PAYMENT_RECORDED,
    actor_id: actor,
    details: {
      amount,
      method: body.method,
      ...(body.reference ? { reference: body.reference } : {}),
    },
  })

  try {
    captureEvent(actor ?? "system", "order_payment_recorded", {
      order_id: orderId,
      amount,
      method: body.method,
    })
  } catch {
    /* best-effort */
  }

  const balanceAfter =
    balance === null ? null : Math.max(0, Math.round((balance - amount) * 100) / 100)
  return res.json({ ok: true, amount, method: body.method, balance_due: balanceAfter })
}
