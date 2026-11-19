import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { toCsv } from "../../../../../lib/csv"
import { SHARE_ROLES, listCustomerOrgs } from "../../../../../lib/customer-org-sharing"
import { requireCustomer } from "../../../../../lib/require-customer"
import { statementCsvRows } from "../../../../../lib/spend-report"
import { buildDocPdf } from "../../../../../services/customer-docs/pdf"
import { loadSpendReport, statementDoc } from "../../../../../services/customer-docs/spend"

/**
 * GET /store/customers/me/spend[?organisation_id=…][&format=csv|pdf]
 *   → { scope, organisations, report }  (or the statement as CSV / PDF)
 *
 * Spend by month (24 months), by cost centre when orders carry one, and a
 * statement of invoices — for the signed-in customer, or for one of their
 * organisations when they are its owner or a purchaser (not a member → 404,
 * viewer → 403).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const orgs = await listCustomerOrgs(req.scope, customerId)
  const organisationId = typeof req.query?.organisation_id === "string" ? req.query.organisation_id : ""

  let scopeName: string | null = null
  if (organisationId) {
    const membership = orgs.find((o) => o.organisation_id === organisationId)
    if (!membership) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organisation not found.")
    if (!SHARE_ROLES.includes(membership.role)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only owners and purchasers can see an organisation's spend.")
    }
    scopeName = membership.organisation_name
  }

  const report = await loadSpendReport(req.scope, organisationId ? { organisationId } : { customerId })
  const format = String(req.query?.format ?? "")
  const date = report.generated_at.slice(0, 10)

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="sc-prints-statement-${date}.csv"`)
    return res.status(200).send(toCsv(statementCsvRows(report)))
  }
  if (format === "pdf") {
    const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const c = await knex("customer").where("id", customerId).first("first_name", "last_name", "company_name", "email")
    const person = [c?.first_name, c?.last_name].filter(Boolean).join(" ")
    const pdf = await buildDocPdf(statementDoc(report, [scopeName ?? c?.company_name, person, c?.email].filter(Boolean)))
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="sc-prints-statement-${date}.pdf"`)
    res.setHeader("Content-Length", pdf.length)
    return res.status(200).send(pdf)
  }

  res.json({
    scope: organisationId ? { type: "organisation", id: organisationId, name: scopeName } : { type: "customer" },
    // Organisations this customer can run the report for.
    organisations: orgs
      .filter((o) => SHARE_ROLES.includes(o.role))
      .map((o) => ({ id: o.organisation_id, name: o.organisation_name })),
    report,
  })
}
