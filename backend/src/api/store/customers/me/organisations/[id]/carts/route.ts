import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { canApprove, money } from "../../../../../../../lib/org-account"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import { customersById, notifyOrgCart } from "../../../../../../../services/org-account"
import { zodMessage } from "../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../_helpers"
import { summariseCarts } from "./_shared"

/**
 * GET /store/customers/me/organisations/:id/carts
 *   → { carts: [{ id, cart_id, name, status, cost_centre, note, created_by,
 *        created_by_name, is_mine, created_at, decided_by_name, decided_at,
 *        decline_reason, total, item_count, order_id, can_approve, can_open }] }
 *
 * Drafts and approvals, newest first. Owners and purchasers only.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const rows = (await service.listOrganisationCarts(
    { organisation_id: membership.organisation_id },
    { take: 100, order: { created_at: "DESC" } }
  )) as any[]
  const [carts, people, owners] = await Promise.all([
    summariseCarts(req.scope, rows.filter((r) => r.status !== "ordered").map((r) => r.cart_id)),
    customersById(req.scope, rows.flatMap((r) => [r.created_by, r.decided_by ?? ""])),
    service.listOrganisationMembers({ organisation_id: membership.organisation_id, role: "owner" }, { take: 50 }),
  ])
  res.json({
    carts: rows.map((r) => {
      const isMine = r.created_by === membership.customer_id
      const cart = carts[r.cart_id]
      return {
        id: r.id,
        cart_id: r.cart_id,
        name: r.name,
        status: r.status,
        cost_centre: r.cost_centre ?? null,
        note: r.note ?? null,
        created_by: r.created_by,
        created_by_name: people[r.created_by]?.name ?? "A team member",
        is_mine: isMine,
        created_at: r.created_at,
        decided_by_name: r.decided_by ? (people[r.decided_by]?.name ?? null) : null,
        decided_at: r.decided_at ?? null,
        decline_reason: r.decline_reason ?? null,
        total: cart?.total ?? money(r.approved_total),
        item_count: cart?.item_count ?? 0,
        order_id: r.order_id ?? null,
        can_approve:
          r.status === "awaiting_approval" &&
          canApprove({ role: membership.role, isRequester: isMine, ownerCount: (owners as any[]).length }),
        can_open:
          r.status === "draft" ||
          ((r.status === "approved" || r.status === "declined") && (isMine || membership.role === "owner")),
      }
    }),
  })
}

const createSchema = z.object({
  cart_id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).nullable().optional(),
  cost_centre: z.string().trim().max(40).nullable().optional(),
  organisation_po_id: z.string().max(80).nullable().optional(),
  send_for_approval: z.boolean().optional(),
})

/**
 * POST /store/customers/me/organisations/:id/carts
 *   { cart_id, name, note?, cost_centre?, organisation_po_id?, send_for_approval? }
 *   → { cart: { id, status } }
 *
 * Park the caller's own cart with the organisation: as a draft anyone who
 * buys for the organisation can open, or (send_for_approval) for an owner to
 * approve. The cart is tagged with the organisation so checkout treats it as
 * an organisation order from here on. Owners are emailed on a request.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const parsed = createSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const body = parsed.data

  const cart = (await summariseCarts(req.scope, [body.cart_id]))[body.cart_id]
  // Someone else's cart is "not found", same as a missing one.
  if (!cart || cart.completed || cart.customer_id !== membership.customer_id) {
    return res.status(404).json({ error: "Cart not found.", message: "Cart not found." })
  }
  if (!cart.item_count) return res.status(400).json({ error: "Your cart is empty.", message: "Your cart is empty." })

  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  // Keep a cost centre only if it's one of this organisation's: a cart can
  // still carry another organisation's from an earlier draft.
  if (body.cost_centre) {
    const [centre] = (await service.listOrganisationCostCentres(
      { organisation_id: membership.organisation_id, code: body.cost_centre, is_active: true },
      { take: 1 }
    )) as any[]
    if (!centre) body.cost_centre = null
  }
  const status = body.send_for_approval ? "awaiting_approval" : "draft"
  const fields = {
    name: body.name,
    note: body.note || null,
    cost_centre: body.cost_centre || null,
    status,
    decided_by: null,
    decided_at: null,
    decline_reason: null,
    approved_total: null,
  }
  let [existing] = (await service.listOrganisationCarts({ cart_id: cart.id }, { take: 1 })) as any[]
  if (existing && existing.organisation_id !== membership.organisation_id) {
    // Waiting on (or approved by) another organisation's owner: that decision stands.
    if (existing.status === "awaiting_approval" || existing.status === "approved") {
      return res.status(409).json({ error: "This cart is already saved with another organisation.", message: "This cart is already saved with another organisation." })
    }
    // A draft (or declined) reopened into the cart and now saved for this
    // organisation, or one whose organisation was deleted: it moves here.
    await service.deleteOrganisationCarts([existing.id])
    existing = undefined
  }
  let row: any
  if (existing) {
    await service.updateOrganisationCarts([{ id: existing.id, ...fields }])
    row = { ...existing, ...fields }
  } else {
    ;[row] = await service.createOrganisationCarts([
      { organisation_id: membership.organisation_id, cart_id: cart.id, created_by: membership.customer_id, ...fields },
    ])
  }

  // Merge, never replace: the cart's metadata carries the PO number etc.
  const meta: Record<string, unknown> = { ...cart.metadata, organisation_id: membership.organisation_id }
  if (body.cost_centre) meta.cost_centre = body.cost_centre
  else delete meta.cost_centre
  if (body.organisation_po_id) {
    const [po] = (await service.listOrganisationPurchaseOrders(
      { id: body.organisation_po_id, organisation_id: membership.organisation_id },
      { take: 1 }
    )) as any[]
    if (!po) return res.status(400).json({ error: "That purchase order isn't on this organisation.", message: "That purchase order isn't on this organisation." })
    meta.organisation_po_id = po.id
    meta.po_number = po.number
  } else {
    delete meta.organisation_po_id
  }
  await (req.scope.resolve(Modules.CART) as any).updateCarts(cart.id, { metadata: meta })

  if (status === "awaiting_approval") {
    const org = await service.retrieveOrganisation(membership.organisation_id)
    await notifyOrgCart(req.scope, {
      kind: "requested",
      row,
      orgName: org.name,
      total: cart.total,
      actorId: membership.customer_id,
    })
  }
  res.status(201).json({ cart: { id: row.id, status } })
}
