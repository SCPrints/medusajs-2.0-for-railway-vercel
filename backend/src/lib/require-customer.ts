import { MedusaError } from "@medusajs/framework/utils"

/**
 * Resolve the authenticated customer id on a `/store/customers/me/*` route.
 * Those routes already sit behind Medusa's customer auth middleware; this is
 * the inner `actor_id`-or-401 read every handler used to repeat locally.
 */
export function requireCustomer(req: {
  auth_context?: { actor_id?: string } | null
}): string {
  const id = req.auth_context?.actor_id
  if (!id) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not authenticated.")
  }
  return id
}
