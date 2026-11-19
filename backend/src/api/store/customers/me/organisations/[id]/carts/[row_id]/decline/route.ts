import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"

import { canApprove } from "../../../../../../../../../lib/org-account"
import { notifyOrgCart } from "../../../../../../../../../services/org-account"
import { requireMembership } from "../../../../_helpers"
import { findOrgCart, summariseCarts } from "../../_shared"

const bodySchema = z.object({ reason: z.string().trim().min(1, "Say why, so they can fix it.").max(500) })

/**
 * POST /store/customers/me/organisations/:id/carts/:row_id/decline   { reason }
 *   → { status: "declined" }
 * Owner only; a reason is required and is emailed to the requester.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "A reason is required.", message: parsed.error.issues[0]?.message ?? "A reason is required." })
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
    return res.status(403).json({ error: "Another owner needs to decide this.", message: "Another owner needs to decide this." })
  }
  if (row.status !== "awaiting_approval") {
    return res.status(409).json({ error: "This order isn't waiting for approval.", message: "This order isn't waiting for approval." })
  }
  const update = {
    status: "declined",
    decided_by: membership.customer_id,
    decided_at: new Date(),
    decline_reason: parsed.data.reason,
  }
  await service.updateOrganisationCarts([{ id: row.id, ...update }])
  const [org, carts] = await Promise.all([
    service.retrieveOrganisation(membership.organisation_id),
    summariseCarts(req.scope, [row.cart_id]),
  ])
  await notifyOrgCart(req.scope, {
    kind: "declined",
    row: { ...row, ...update },
    orgName: org.name,
    total: carts[row.cart_id]?.total ?? null,
    actorId: membership.customer_id,
  })
  res.json({ status: "declined" })
}
