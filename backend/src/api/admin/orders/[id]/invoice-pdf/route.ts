import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  generateReceiptPdf,
  loadReceiptOrder,
} from "../../../../../services/order-receipt-pdf/service"

/**
 * GET /admin/orders/:id/invoice-pdf
 *   → application/pdf (inline)
 *
 * Renders the exact tax-invoice PDF the email attaches, so staff can preview
 * an order's invoice before sending it via the "Email tax invoice" button.
 * Admin-auth gated by Medusa's core admin middleware.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id

  const order = await loadReceiptOrder(req.scope, orderId)
  if (!order) {
    return res.status(404).json({ error: "order not found" })
  }

  const pdf = await generateReceiptPdf(order)
  const displayId = order.display_id ?? orderId

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `inline; filename="tax-invoice-${displayId}.pdf"`
  )
  res.setHeader("Content-Length", pdf.length)
  res.status(200).send(pdf)
}
