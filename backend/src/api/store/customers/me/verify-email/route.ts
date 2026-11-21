import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { isEmailVerified } from "../../../../../lib/email-verification"

/** GET /store/customers/me/verify-email → { verified, email } (drives the account banner). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customer: any = await (req.scope.resolve(Modules.CUSTOMER) as any)
    .retrieveCustomer(req.auth_context.actor_id)
    .catch(() => null)
  if (!customer) return res.status(404).json({ error: "Not found" })
  return res.json({ verified: isEmailVerified(customer), email: customer.email ?? null })
}
