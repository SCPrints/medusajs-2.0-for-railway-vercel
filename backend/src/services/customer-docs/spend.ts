import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { buildSpendReport, toSpendOrder, type SpendOrder, type SpendReport } from "../../lib/spend-report"
import { longDate, money, type DocSpec } from "./pdf"

export const SPEND_MONTHS = 24
const MAX_ORDERS = 2000

/**
 * Orders behind a spend report: the customer's own, or everything placed for
 * an organisation (`metadata.organisation_id` — website orders tagged to the
 * organisation and its held-stock fulfilment orders alike).
 */
export async function loadSpendOrders(
  container: any,
  scope: { customerId: string } | { organisationId: string }
): Promise<SpendOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const since = new Date()
  since.setMonth(since.getMonth() - SPEND_MONTHS - 1)
  const { data } = await query.graph({
    entity: "order",
    filters: {
      ...("customerId" in scope ? { customer_id: scope.customerId } : { metadata: { organisation_id: scope.organisationId } }),
      created_at: { $gte: since },
    },
    // `summary.*` carries the order's current total and what has been paid;
    // the order-level `total` from the graph is not reliable (see reports/orders.ts).
    fields: ["id", "display_id", "created_at", "canceled_at", "status", "currency_code", "metadata", "summary.*"],
    pagination: { take: MAX_ORDERS, skip: 0, order: { created_at: "DESC" } },
  })
  return ((data ?? []) as any[]).map(toSpendOrder).filter((o): o is SpendOrder => o != null)
}

export async function loadSpendReport(
  container: any,
  scope: { customerId: string } | { organisationId: string }
): Promise<SpendReport> {
  return buildSpendReport(await loadSpendOrders(container, scope), new Date(), SPEND_MONTHS)
}

export function statementDoc(report: SpendReport, forLines: string[]): DocSpec {
  const cc = report.cost_centres.length > 0
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })
  const active = report.months.filter((m) => m.orders > 0)
  return {
    title: "Statement",
    subtitle: `${report.months[0].label} to ${report.months[report.months.length - 1].label}  ·  ${longDate(report.generated_at)}`,
    to: forLines,
    facts: [
      ["Orders", String(report.totals.orders)],
      ["Outstanding", money(report.totals.outstanding)],
    ],
    tables: [
      {
        heading: "Invoices",
        columns: [
          { label: "Date", width: 0.14 },
          { label: "Order", width: cc ? 0.09 : 0.1 },
          { label: "PO", width: cc ? 0.14 : 0.24 },
          ...(cc ? [{ label: "Cost centre", width: 0.15 }] : []),
          { label: "Total", width: cc ? 0.12 : 0.14, align: "right" as const },
          { label: "Paid", width: cc ? 0.11 : 0.12, align: "right" as const },
          { label: "Owing", width: cc ? 0.11 : 0.12, align: "right" as const },
          { label: "Status", width: 0.14, align: "right" as const },
        ],
        rows: report.statement.map((r) => [
          date(r.date),
          r.display_id ? `#${r.display_id}` : "",
          r.po_number ?? "",
          ...(cc ? [r.cost_centre ?? ""] : []),
          money(r.total),
          money(r.paid),
          money(r.outstanding),
          r.status_label,
        ]),
      },
      ...(active.length
        ? [
            {
              heading: "Spend by month",
              columns: [
                { label: "Month", width: 0.5 },
                { label: "Orders", width: 0.2, align: "right" as const },
                { label: "Spend", width: 0.3, align: "right" as const },
              ],
              rows: active.map((m) => [m.label, String(m.orders), money(m.total)]),
            },
          ]
        : []),
      ...(cc
        ? [
            {
              heading: "Spend by cost centre",
              columns: [
                { label: "Cost centre", width: 0.5 },
                { label: "Orders", width: 0.2, align: "right" as const },
                { label: "Spend", width: 0.3, align: "right" as const },
              ],
              rows: report.cost_centres.map((c) => [c.cost_centre, String(c.orders), money(c.total)]),
            },
          ]
        : []),
    ],
    totals: [
      { label: "Total spend (inc GST)", value: money(report.totals.spend), bold: true },
      { label: "Paid", value: money(report.totals.paid) },
      { label: "Outstanding", value: money(report.totals.outstanding) },
    ],
    notes: ["All amounts are in Australian dollars and include GST. Tax invoices for each order are in your account under Orders."],
  }
}
