import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../../modules/organisation/service"
import { requireMembership } from "../../../_helpers"

/**
 * GET /store/customers/me/organisations/[id]/orders/[oid]
 *
 * Single order detail filtered to this org. Returns 404 if the order
 * doesn't belong to the org (or the caller isn't a member).
 *
 * Hydrates the destination snapshot so the storefront can render the
 * "Shipping to" block without an extra fetch.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
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
      fields: [
        "id",
        "display_id",
        "email",
        "total",
        "subtotal",
        "tax_total",
        "shipping_total",
        "currency_code",
        "status",
        "created_at",
        "updated_at",
        "metadata",
        "shipping_address.*",
        "billing_address.*",
        "items.*",
        "items.metadata",
        "fulfillments.*",
        "fulfillments.labels.*",
      ],
    })
    order = data?.[0]
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "retrieve failed" })
  }

  if (!order) {
    return res.status(404).json({ error: "not_found" })
  }

  // Ownership check: 404 when this org doesn't own the order
  const orderOrgId = order.metadata?.organisation_id
  if (orderOrgId !== membership.organisation_id) {
    return res.status(404).json({ error: "not_found" })
  }

  // Hydrate destination context (read-only, by id)
  let destination: any = null
  const destId = order.metadata?.organisation_destination_id
  if (destId) {
    try {
      const orgService =
        req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
      destination = await orgService.retrieveOrganisationDestination(destId)
    } catch {
      /* destination may have been removed since order placement;
       * shipping_address still has the snapshot */
    }
  }

  // Hydrate the "placed by" customer (best effort, name + email only)
  let placedBy: { id: string; email: string | null; first_name: string | null; last_name: string | null } | null = null
  const placedById = order.metadata?.placed_by_customer_id
  if (placedById) {
    try {
      const { data } = await query.graph({
        entity: "customer",
        filters: { id: placedById },
        fields: ["id", "email", "first_name", "last_name"],
      })
      const c = data?.[0]
      if (c) {
        placedBy = {
          id: c.id,
          email: c.email ?? null,
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
        }
      }
    } catch {
      /* placed_by_customer_id may be invalid — fall through */
    }
  }

  res.json({ order, destination, placed_by: placedBy, role: membership.role })
}
