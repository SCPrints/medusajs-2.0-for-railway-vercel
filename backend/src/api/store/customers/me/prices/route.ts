import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { toCsv } from "../../../../../lib/csv"
import { priceListCsvRows } from "../../../../../lib/price-list"
import { requireCustomer } from "../../../../../lib/require-customer"
import { buildDocPdf } from "../../../../../services/customer-docs/pdf"
import { buildPriceList, priceListDoc } from "../../../../../services/customer-docs/price-list"

/**
 * GET /store/customers/me/prices            → { price_list }
 * GET /store/customers/me/prices?format=csv → text/csv
 * GET /store/customers/me/prices?format=pdf → application/pdf
 *
 * The signed-in customer's prices by quantity for the garments they order,
 * plus the print and embroidery price tables. GST-inclusive, dated.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const list = await buildPriceList(req.scope, customerId)
  const format = String(req.query?.format ?? "")
  const date = list.generated_at.slice(0, 10)

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="sc-prints-price-list-${date}.csv"`)
    return res.status(200).send(toCsv(priceListCsvRows(list)))
  }
  if (format === "pdf") {
    const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const c = await knex("customer").where("id", customerId).first("first_name", "last_name", "company_name", "email")
    const pdf = await buildDocPdf(
      priceListDoc(list, [c?.company_name, [c?.first_name, c?.last_name].filter(Boolean).join(" "), c?.email].filter(Boolean))
    )
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="sc-prints-price-list-${date}.pdf"`)
    res.setHeader("Content-Length", pdf.length)
    return res.status(200).send(pdf)
  }
  res.json({ price_list: list })
}
