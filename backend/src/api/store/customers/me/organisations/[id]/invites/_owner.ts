import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { requireMembership } from "../../_helpers"

/** Owners only; everyone else gets 404, like the organisation itself. */
export async function requireOwnerOr404(req: AuthenticatedMedusaRequest) {
  const m = await requireMembership(req)
  if (m.role !== "owner") throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organisation not found.")
  return m
}
