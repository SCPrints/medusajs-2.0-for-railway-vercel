import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireCustomer } from "../../../../../lib/require-customer"
import { listCustomerQuotes } from "../../../../../services/customer-quotes/load"

/**
 * GET /store/customers/me/quotes → { quotes }
 *
 * The signed-in customer's quotes (their id on the quote, or their email),
 * newest first. Customer-safe fields only — see lib/customer-quotes.ts.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  res.json({ quotes: await listCustomerQuotes(req.scope, customerId) })
}
