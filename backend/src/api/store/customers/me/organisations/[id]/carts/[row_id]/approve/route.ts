import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { canApprove } from "../../../../../../../../../lib/org-account"
import { notifyOrgCart, placeCartOnAccount } from "../../../../../../../../../services/org-account"
import { requireMembership } from "../../../../_helpers"
import { findOrgCart, summariseCarts } from "../../_shared"

/**
 * POST /store/customers/me/organisations/:id/carts/:row_id/approve
 *   → { status: "ordered", order_id, display_id }      placed on account
 *   → { status: "approved", handoff: true, message? }  owner opens it and pays
 *
 * Owner only (not their own request unless they are the only owner). When
 * staff have given the organisation account terms the order is placed
 * straight away, unpaid, in the requester's name. Otherwise, or if it can't
 * be placed (credit limit, missing delivery details), the cart is approved
 * up to its current total and the owner opens it to pay. The requester is
 * emailed either way.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const { service, row } = await findOrgCart(req.scope, membership.organisation_id, req.params.row_id)
  if (!row) return res.status(404).json({ error: "not_found", message: "not_found" })
  const owners = (await service.listOrganisationMembers(
    { organisation_id: membership.organisation_id, role: "owner" },
    { take: 50 }
  )) as any[]
  if (
    !canApprove({
      role: membership.role,
      isRequester: row.created_by === membership.customer_id,
      ownerCount: owners.length,
    })
  ) {
    return res.status(403).json({ error: "Another owner needs to approve this.", message: "Another owner needs to approve this." })
  }
  if (row.status !== "awaiting_approval") {
    return res.status(409).json({ error: "This order isn't waiting for approval.", message: "This order isn't waiting for approval." })
  }
  const cart = (await summariseCarts(req.scope, [row.cart_id]))[row.cart_id]
  if (!cart || cart.completed || cart.total == null) {
    return res.status(409).json({ error: "This cart is no longer available.", message: "This cart is no longer available." })
  }

  const decided = { decided_by: membership.customer_id, decided_at: new Date(), approved_total: cart.total }
  await service.updateOrganisationCarts([{ id: row.id, status: "approved", ...decided }])
  const org = await service.retrieveOrganisation(membership.organisation_id)
  const notify = (extra: { orderDisplayId?: number | string | null; handoff?: boolean }) =>
    notifyOrgCart(req.scope, {
      kind: "approved",
      row,
      orgName: org.name,
      total: cart.total,
      actorId: membership.customer_id,
      ...extra,
    })

  if (org.account_terms_enabled === true) {
    const placed = await placeCartOnAccount(req.scope, row.cart_id)
    if (placed.ok === true) {
      await service.updateOrganisationCarts([{ id: row.id, status: "ordered", order_id: placed.order_id }])
      let displayId: number | string | null = null
      try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
        const { data } = await query.graph({
          entity: "order",
          filters: { id: placed.order_id },
          fields: ["id", "display_id"],
        })
        displayId = (data as any[])?.[0]?.display_id ?? null
      } catch {
        /* the order is placed; the number is a nicety */
      }
      await notify({ orderDisplayId: displayId })
      return res.json({ status: "ordered", order_id: placed.order_id, display_id: displayId })
    }
    await notify({ handoff: true })
    return res.json({ status: "approved", handoff: true, message: placed.message })
  }
  await notify({ handoff: true })
  res.json({ status: "approved", handoff: true })
}
