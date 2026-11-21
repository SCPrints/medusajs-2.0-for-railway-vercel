import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { isEmailVerified } from "../../../../../../lib/email-verification"
import { sendVerificationEmail } from "../../../../../../services/customer-verification/send"

/**
 * POST /store/customers/me/verify-email/resend
 * 200 { sent: true } | 200 { verified: true } already confirmed | 429 over 3 a day.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const id = req.auth_context.actor_id
  const customer: any = await (req.scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(id).catch(() => null)
  if (!customer) return res.status(404).json({ error: "Not found" })
  if (isEmailVerified(customer)) return res.json({ verified: true })
  const result = await sendVerificationEmail(req.scope, id)
  if (result === "limit") return res.status(429).json({ error: "You've asked for this a few times today. Try again tomorrow." })
  return res.json({ sent: result === "sent" })
}
