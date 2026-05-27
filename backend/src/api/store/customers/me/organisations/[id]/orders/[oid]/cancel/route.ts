import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../../../lib/audit-log"
import { captureEvent } from "../../../../../../../../../lib/posthog"
import { requireMembership, requireRole } from "../../../../_helpers"

const CANCEL_WINDOW_HOURS = 24

/**
 * POST /store/customers/me/organisations/[id]/orders/[oid]/cancel
 *
 * Customer self-cancel within `CANCEL_WINDOW_HOURS` of placement.
 * After that the customer must contact SC Prints.
 *
 * Calls Medusa's `cancelOrderWorkflow`; the Phase 1
 * `fulfillment-on-order-cancelled` subscriber writes the `release`
 * movements automatically.
 *
 * Role: purchaser or owner. Viewers cannot cancel.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  requireRole(membership, ["purchaser", "owner"])

  const oid = req.params?.oid
  if (!oid) {
    return res.status(404).json({ error: "not_found" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  let order: any
  try {
    const { data } = await query.graph({
      entity: "orders",
      filters: { id: oid },
      fields: ["id", "status", "created_at", "metadata", "canceled_at"],
    })
    order = data?.[0]
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "retrieve failed" })
  }

  if (!order || order.metadata?.organisation_id !== membership.organisation_id) {
    return res.status(404).json({ error: "not_found" })
  }

  if (order.canceled_at) {
    return res.status(400).json({ error: "Order already cancelled." })
  }

  const ageMs = Date.now() - new Date(order.created_at).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)
  if (ageHours > CANCEL_WINDOW_HOURS) {
    return res.status(403).json({
      error: `Cancellation window expired (${CANCEL_WINDOW_HOURS}h after placement). Contact SC Prints.`,
    })
  }

  try {
    await cancelOrderWorkflow(req.scope).run({
      input: {
        order_id: oid,
        canceled_by: membership.customer_id,
      } as any,
    })
  } catch (err: any) {
    const detail = String(err?.message ?? err)
    // Bubble Medusa errors with a friendlier message
    if (err instanceof MedusaError) {
      return res
        .status(400)
        .json({ error: `Unable to cancel order: ${detail}` })
    }
    return res.status(500).json({
      error: "Failed to cancel order. Please try again.",
      detail,
    })
  }

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: oid,
    action: AUDIT_ACTION.FULFILLMENT_ORDER_CANCELLED,
    actor_id: membership.customer_id,
    details: {
      organisation_id: membership.organisation_id,
      age_hours: Math.round(ageHours * 10) / 10,
      source: "portal",
    },
  })

  try {
    captureEvent(membership.customer_id, "portal_order_cancelled", {
      org_id: membership.organisation_id,
      order_id: oid,
      age_hours: Math.round(ageHours * 10) / 10,
    })
  } catch {
    /* PostHog best-effort */
  }

  res.json({ ok: true })
}
