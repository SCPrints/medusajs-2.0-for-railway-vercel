import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import {
  generateReceiptPdf,
  loadReceiptOrder,
} from "../../../../../../../services/order-receipt-pdf/service"
import { requireCustomer } from "../../../../../../../lib/require-customer"

/**
 * GET /store/customers/me/orders/:id/receipt-pdf
 *
 * Returns a server-rendered PDF tax invoice for the order. Auth-gated to the
 * order's customer — same shape as the existing /invoice route, but generates
 * a real PDF via pdfkit instead of print-stylesheet HTML.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)

  const orderId = req.params.id
  if (!orderId) {
    return res.status(400).json({ error: "id required" })
  }

  const order = await loadReceiptOrder(req.scope, orderId)
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  }

  const pdfBuffer = await generateReceiptPdf(order)
  const displayId = order.display_id ?? orderId

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="receipt-${displayId}.pdf"`
  )
  res.setHeader("Content-Length", pdfBuffer.length)
  res.status(200).send(pdfBuffer)
}
