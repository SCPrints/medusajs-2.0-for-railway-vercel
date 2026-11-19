import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { MINIO_PUBLIC_URL } from "../../../../../../../lib/constants"
import { collectPackFiles } from "../../../../../../../lib/download-pack"
import { requireCustomer } from "../../../../../../../lib/require-customer"
import { createZip } from "../../../../../../../lib/zip-store"
import { generateReceiptPdf, loadReceiptOrder } from "../../../../../../../services/order-receipt-pdf/service"

const FETCH_TIMEOUT_MS = 15_000
const MAX_FILE_BYTES = 40 * 1024 * 1024
const MAX_TOTAL_BYTES = 250 * 1024 * 1024

/**
 * GET /store/customers/me/orders/:id/download-pack → application/zip
 *
 * "Download everything" for one of the customer's own orders: the tax invoice
 * (PDF), proofs / mockups, and their artwork files. Files are fetched from our
 * file host only, one at a time, and written to the response as they arrive.
 * A file that can't be fetched (or would blow the size caps) is listed in
 * "Missing files.txt" rather than failing the download.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const order = await loadReceiptOrder(req.scope, req.params.id)
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  }
  const displayId = String(order.display_id ?? order.id)
  // Built before any bytes go out, so a failure here is still a clean error.
  const invoice = await generateReceiptPdf(order)

  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="SC-Prints-order-${displayId}.zip"`)
  res.status(200)

  const zip = createZip((chunk) => void res.write(chunk))
  zip.add(`Tax invoice ${displayId}.pdf`, invoice)

  const missing: string[] = []
  let total = invoice.length
  for (const file of collectPackFiles(order as any, MINIO_PUBLIC_URL)) {
    try {
      const upstream = await fetch(file.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "error" })
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`)
      const declared = Number(upstream.headers.get("content-length") ?? 0)
      if (declared > MAX_FILE_BYTES || total + declared > MAX_TOTAL_BYTES) throw new Error("too big for the pack")
      const data = Buffer.from(await upstream.arrayBuffer())
      if (data.length > MAX_FILE_BYTES || total + data.length > MAX_TOTAL_BYTES) throw new Error("too big for the pack")
      total += data.length
      zip.add(file.path, data)
    } catch (err: any) {
      missing.push(`${file.path} (${err?.name === "TimeoutError" ? "timed out" : err?.message ?? "failed"})`)
    }
  }
  if (missing.length) {
    zip.add(
      "Missing files.txt",
      Buffer.from(
        `These files could not be added. Email info@scprints.com.au with order #${displayId} and we will send them.\r\n\r\n${missing.join("\r\n")}\r\n`,
        "utf8"
      )
    )
  }
  zip.end()
  res.end()
}
