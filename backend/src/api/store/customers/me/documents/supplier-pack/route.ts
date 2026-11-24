import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { requireCustomer } from "../../../../../../lib/require-customer"
import { buildDocPdf } from "../../../../../../services/customer-docs/pdf"
import { supplierPackDoc, supplierPackInput } from "../../../../../../services/customer-docs/supplier-pack"

/**
 * GET /store/customers/me/documents/supplier-pack → application/pdf
 * Our supplier details (ABN, address, bank details, certificate links) for a
 * new customer's accounts team, addressed to the signed-in customer.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const c = await knex("customer").where("id", customerId).first("first_name", "last_name", "company_name")
  const pdf = await buildDocPdf(
    supplierPackDoc(await supplierPackInput(req.scope, [c?.company_name, [c?.first_name, c?.last_name].filter(Boolean).join(" ")]))
  )
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="sc-prints-supplier-details.pdf"`)
  res.setHeader("Content-Length", pdf.length)
  res.status(200).send(pdf)
}
