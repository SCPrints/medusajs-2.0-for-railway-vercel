import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { isEmailVerified, markVerified, verifyEmailVerification } from "../../../../lib/email-verification"
import { claimGuestMemberships } from "../../../../services/organisation-guest-claim"

const schema = z.object({
  email: z.string().trim().min(3).max(200),
  exp: z.coerce.number().int(),
  sig: z.string().trim().min(8).max(100),
})

/**
 * POST /store/customers/verify-email  { email, exp, sig }
 * Public: the signed link is the proof. Confirms every registered account with
 * that email. 200 { verified: true } | 400 { reason: "expired" | "invalid" }.
 * Quotes already match by email at read time, so they appear straight away.
 * Organisations staff added this person to before they signed up (on a guest
 * record) move onto the account here.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ reason: "invalid" })
  const result = verifyEmailVerification(parsed.data)
  if ("reason" in result) return res.status(400).json({ reason: result.reason === "expired" ? "expired" : "invalid" })

  const customers = req.scope.resolve(Modules.CUSTOMER) as any
  const matches: any[] = await customers.listCustomers({ email: result.email, has_account: true })
  for (const c of matches) {
    if (!isEmailVerified(c)) await customers.updateCustomers(c.id, { metadata: markVerified(c.metadata) })
    await claimGuestMemberships(req.scope as any, c)
  }
  return res.json({ verified: true })
}
