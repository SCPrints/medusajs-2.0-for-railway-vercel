import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { poNumberFromMetadata } from "../../../../../../../../lib/po-number"
import { customersById } from "../../../../../../../../services/org-account"
import { requireMembership, requireRole } from "../../../_helpers"
import { findOrgCart, summariseCarts } from "../_shared"

/**
 * GET /store/customers/me/organisations/:id/carts/:row_id
 *   → { cart: { id, name, status, note, cost_centre, po_number, created_by_name,
 *        total, has_delivery, lines: [{ id, title, subtitle, quantity, unit_price, thumbnail }] } }
 * What an owner needs to approve: the lines, total, cost centre and note.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { row } = await findOrgCart(req.scope, membership.organisation_id, req.params.row_id)
  if (!row) return res.status(404).json({ error: "not_found", message: "not_found" })
  const [carts, people] = await Promise.all([
    summariseCarts(req.scope, [row.cart_id]),
    customersById(req.scope, [row.created_by]),
  ])
  const cart = carts[row.cart_id]
  res.json({
    cart: {
      id: row.id,
      name: row.name,
      status: row.status,
      note: row.note ?? null,
      cost_centre: row.cost_centre ?? null,
      po_number: poNumberFromMetadata(cart?.metadata),
      created_by_name: people[row.created_by]?.name ?? "A team member",
      total: cart?.total ?? null,
      has_delivery: cart?.has_delivery ?? false,
      lines: cart?.lines ?? [],
    },
  })
}

/**
 * DELETE …/carts/:row_id — the person who saved it, or an owner. Removes the
 * saved entry only (never an order). Not once it has been ordered.
 */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { service, row } = await findOrgCart(req.scope, membership.organisation_id, req.params.row_id)
  if (!row) return res.json({ ok: true })
  if (row.created_by !== membership.customer_id && membership.role !== "owner") {
    return res.status(403).json({ error: "Only the person who saved this, or an owner, can delete it.", message: "Only the person who saved this, or an owner, can delete it." })
  }
  if (row.status === "ordered") return res.status(409).json({ error: "This has already been ordered.", message: "This has already been ordered." })
  await service.deleteOrganisationCarts([row.id])
  res.json({ ok: true })
}
