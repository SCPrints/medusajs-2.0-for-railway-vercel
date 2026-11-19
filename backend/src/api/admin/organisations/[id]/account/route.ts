import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { money } from "../../../../../lib/org-account"
import { loadOrgAccount } from "../../../../../services/org-account"

/**
 * GET /admin/organisations/:id/account
 *   → { account: { terms_enabled, terms_days, credit_limit, outstanding, available, ap_email },
 *       purchase_orders: [{ id, number, amount, drawn, remaining, expires_at, is_active, expired }],
 *       cost_centres: [{ id, code, name, is_active }] }
 * The terms themselves are edited through POST /admin/organisations/:id.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let account
  try {
    account = await loadOrgAccount(req.scope, req.params.id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  res.json({
    account: {
      terms_enabled: account.org.account_terms_enabled === true,
      terms_days: Number(account.org.account_terms_days) || 30,
      credit_limit: money(account.org.credit_limit),
      outstanding: account.outstanding,
      available: account.available,
      ap_email: account.org.ap_email ?? null,
    },
    purchase_orders: account.purchase_orders,
    cost_centres: account.cost_centres,
  })
}
