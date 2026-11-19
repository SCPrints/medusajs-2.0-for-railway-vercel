import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { invoiceStatus } from "../../../../../../../lib/org-account"
import { poNumberFromMetadata } from "../../../../../../../lib/po-number"
import { customersById, loadOrgOrders } from "../../../../../../../services/org-account"
import { requireMembership } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/:id/invoices
 *   → { invoices: [{ order_id, display_id, created_at, total, paid, balance,
 *        po_number, cost_centre, due_at, on_account, status, placed_by }] }
 *
 * Every non-cancelled order placed for the organisation, newest first, with
 * status paid / outstanding / overdue. Any member (the accounts person is
 * often a viewer). The invoice itself opens through
 * /store/customers/me/orders/:order_id/invoice, which lets org members in.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const orders = (await loadOrgOrders(req.scope, membership.organisation_id)).filter((o) => !o.canceled)
  const people = await customersById(
    req.scope,
    orders.map((o) => o.customer_id ?? "")
  )
  const now = new Date()
  res.json({
    invoices: orders.map((o) => {
      const meta = o.metadata ?? {}
      const dueAt = typeof meta.balance_due_at === "string" ? meta.balance_due_at : null
      return {
        order_id: o.id,
        display_id: o.display_id,
        created_at: o.created_at,
        total: o.total,
        paid: o.paid,
        balance: Math.max(0, Math.round((o.total - o.paid) * 100) / 100),
        po_number: poNumberFromMetadata(meta),
        cost_centre: typeof meta.cost_centre === "string" ? meta.cost_centre : null,
        due_at: dueAt,
        on_account: !!meta.account_terms,
        status: invoiceStatus({ total: o.total, paid: o.paid, due_at: dueAt, now }),
        placed_by: (o.customer_id && people[o.customer_id]?.name) || o.email || null,
      }
    }),
  })
}
