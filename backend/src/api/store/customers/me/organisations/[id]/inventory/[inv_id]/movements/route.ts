import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { ORG_INVENTORY_MODULE } from "../../../../../../../../../modules/org-inventory"
import type OrgInventoryModuleService from "../../../../../../../../../modules/org-inventory/service"
import { requireMembership } from "../../../../_helpers"

// Stock that came in / went out, and what an order has set aside.
const DIRECTION: Record<string, "in" | "out" | "reserved" | "released"> = {
  receipt: "in",
  adjustment_up: "in",
  transfer_in: "in",
  shipment: "out",
  adjustment_down: "out",
  transfer_out: "out",
  reservation: "reserved",
  release: "released",
}

/**
 * GET /store/customers/me/organisations/:id/inventory/:inv_id/movements   (any member)
 *   → { movements: [{ id, date, direction: "in" | "out" | "reserved" | "released", quantity, reason, reference }] } newest first, up to 200.
 * Customer-safe: no staff names, notes or user ids. 404 when the stock row belongs to another organisation.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const inv = req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)
  const [row] = (await inv.listOrgInventories(
    { id: req.params.inv_id, organisation_id: membership.organisation_id } as any,
    { take: 1 }
  )) as any[]
  if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Stock row not found.")
  const moves = (await inv.listOrgInventoryMovements({ org_inventory_id: row.id } as any, {
    take: 200,
    order: { created_at: "DESC" },
  })) as any[]
  res.json({
    movements: moves.map((m) => ({
      id: m.id as string,
      date: m.created_at as string,
      direction: DIRECTION[m.reason as string] ?? (m.qty_delta >= 0 ? "in" : "out"),
      quantity: Math.abs(m.qty_delta as number),
      reason: m.reason as string,
      reference: m.reference_id ? `${m.reference_type ?? ""} ${m.reference_id}`.trim() : null,
    })),
  })
}
