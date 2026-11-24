import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { buildDocPdf } from "../../../../services/customer-docs/pdf"
import { supplierPackDoc, supplierPackInput } from "../../../../services/customer-docs/supplier-pack"

/**
 * GET /admin/supplier-documents/supplier-pack?to=<name> → application/pdf
 * The same supplier details PDF customers download, for staff to attach to an
 * email (optionally addressed to `to`).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const to = String(req.query?.to ?? "").trim().slice(0, 120)
  const pdf = await buildDocPdf(supplierPackDoc(await supplierPackInput(req.scope, to ? [to] : [])))
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="sc-prints-supplier-details.pdf"`)
  res.setHeader("Content-Length", pdf.length)
  res.status(200).send(pdf)
}
