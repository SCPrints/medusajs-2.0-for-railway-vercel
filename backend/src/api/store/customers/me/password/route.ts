import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { requireCustomer } from "../../../../../lib/require-customer"

const schema = z.object({
  old_password: z.string().min(1).max(200),
  new_password: z.string().min(8).max(200),
})

/**
 * POST /store/customers/me/password
 * The signed-in customer changes their own password. The current password is
 * checked first, so a borrowed session alone can't lock the owner out.
 * (A forgotten password goes through Medusa's emailed reset link instead.)
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Use at least 8 characters for the new password." })
  }
  const customer = await (req.scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(customerId, { select: ["id", "email"] })
  const email = String(customer?.email ?? "")
  const auth = req.scope.resolve(Modules.AUTH) as any
  const check = await auth.authenticate("emailpass", { body: { email, password: parsed.data.old_password } })
  if (!check?.success) {
    return res.status(400).json({ message: "Your current password isn't right." })
  }
  const done = await auth.updateProvider("emailpass", { entity_id: email, password: parsed.data.new_password })
  if (!done?.success) {
    return res.status(400).json({ message: "We couldn't change your password. Try again." })
  }
  res.json({ success: true })
}
