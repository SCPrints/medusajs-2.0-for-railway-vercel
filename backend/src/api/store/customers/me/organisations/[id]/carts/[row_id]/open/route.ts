import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { transferCartCustomerWorkflow } from "@medusajs/medusa/core-flows"

import { requireMembership, requireRole } from "../../../../_helpers"
import { findOrgCart, summariseCarts } from "../../_shared"

/**
 * POST /store/customers/me/organisations/:id/carts/:row_id/open
 *   → { cart_id }
 *
 * Make a parked cart the caller's own so they can finish it at checkout (the
 * storefront then points its cart cookie at `cart_id`). A draft: any owner or
 * purchaser. Approved (owner pays) or declined (change it and resend): the
 * person who saved it, or an owner. Opening a declined cart makes it a draft
 * again. Never while it waits for approval.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { service, row } = await findOrgCart(req.scope, membership.organisation_id, req.params.row_id)
  if (!row) return res.status(404).json({ error: "not_found", message: "not_found" })
  const mineOrOwner = row.created_by === membership.customer_id || membership.role === "owner"
  if (row.status === "awaiting_approval") {
    return res.status(409).json({ error: "This order is waiting for approval.", message: "This order is waiting for approval." })
  }
  if (row.status === "ordered") return res.status(409).json({ error: "This has already been ordered.", message: "This has already been ordered." })
  if (row.status !== "draft" && !mineOrOwner) {
    return res.status(403).json({ error: "Only the person who saved this, or an owner, can open it.", message: "Only the person who saved this, or an owner, can open it." })
  }
  const cart = (await summariseCarts(req.scope, [row.cart_id]))[row.cart_id]
  if (!cart || cart.completed) return res.status(409).json({ error: "This cart is no longer available.", message: "This cart is no longer available." })
  if (cart.customer_id !== membership.customer_id) {
    await transferCartCustomerWorkflow(req.scope).run({
      input: { id: row.cart_id, customer_id: membership.customer_id },
    })
  }
  if (row.status === "declined") {
    await service.updateOrganisationCarts([{ id: row.id, status: "draft", decline_reason: null }])
  }
  res.json({ cart_id: row.cart_id })
}
