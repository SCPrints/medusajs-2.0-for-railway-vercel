import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { cleanSplitInput, validateSplit, type SplitDelivery } from "../../lib/split-delivery"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import type OrganisationModuleService from "../../modules/organisation/service"

const addressOf = (d: any) =>
  [d.address_1, d.address_2, d.city, d.province, d.postal_code].filter(Boolean).join(", ")

/**
 * POST /store/carts/:id may carry `metadata.split_delivery` (organisation
 * checkout: send this order to 2+ saved destinations). Validate it on the
 * server: the caller must own the cart and be an owner / purchaser of the
 * cart's organisation, every destination must be an active saved destination
 * of THAT organisation, and each line's quantities must add up exactly. On
 * success the value is replaced by a snapshot (names, addresses, line titles)
 * so the job window needs no lookups; on any failure the request is refused
 * (400) and the cart is not changed (an unchanged stored split that no longer
 * fits the cart is cleared instead). "" / null clears it. It copies onto the
 * order at completion with the rest of cart metadata, like po_number.
 */
export async function cleanCartSplitDeliveryMiddleware(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  try {
    for (const body of [req.body, (req as { validatedBody?: unknown }).validatedBody]) {
      const meta = (body as { metadata?: unknown } | undefined)?.metadata
      if (!meta || typeof meta !== "object" || !("split_delivery" in meta)) continue
      const m = meta as Record<string, unknown>
      if (m.split_delivery === "" || m.split_delivery === null) {
        m.split_delivery = ""
        continue
      }
      m.split_delivery = await snapshotSplit(req, m)
    }
    next()
  } catch (err) {
    next(err)
  }
}

async function snapshotSplit(req: MedusaRequest, meta: Record<string, unknown>): Promise<SplitDelivery | ""> {
  const bad = (msg: string) => new MedusaError(MedusaError.Types.INVALID_DATA, msg)
  const split = cleanSplitInput(meta.split_delivery)
  if (!split) throw bad("Choose at least two addresses, or deliver to one.")
  const customerId = (req as { auth_context?: { actor_id?: string } }).auth_context?.actor_id
  if (!customerId) throw bad("Sign in to split a delivery.")

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    filters: { id: req.params.id },
    fields: ["id", "customer_id", "metadata", "items.id", "items.quantity", "items.title", "items.metadata"],
  })
  const cart = data?.[0] as any
  if (!cart || cart.customer_id !== customerId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.")
  const orgId = String(meta.organisation_id || cart.metadata?.organisation_id || "")
  if (!orgId) throw bad("Delivery can only be split on an organisation order.")

  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const [member] = (await service.listOrganisationMembers({ customer_id: customerId, organisation_id: orgId } as any, { take: 1 })) as any[]
  if (!member || (member.role !== "owner" && member.role !== "purchaser")) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organisation not found.")
  }
  const destinations = (await service.listOrganisationDestinations(
    { organisation_id: orgId, is_active: true } as any,
    { take: 500 }
  )) as any[]
  const byId = new Map(destinations.map((d) => [d.id as string, d]))

  // Setup-fee service lines aren't delivered anywhere.
  const items = ((cart.items ?? []) as any[]).filter(
    (i) => !i.metadata?.screen_setup_for_order && !i.metadata?.supacolour_setup_for_order
  )
  const error = validateSplit(split, items.map((i) => ({ id: i.id, quantity: Number(i.quantity) || 0 })), new Set(byId.keys()))
  if (error) {
    // The checkout re-sends the stored value with every cart save. A split the cart has
    // since outgrown is dropped (the checkout screen tells the buyer); a NEW bad one is refused.
    if (JSON.stringify(meta.split_delivery) === JSON.stringify(cart.metadata?.split_delivery)) return ""
    throw bad(error)
  }

  const titleOf = new Map(items.map((i) => [i.id as string, String(i.title ?? "Item")]))
  return split.map((d) => ({
    destination_id: d.destination_id,
    name: String(byId.get(d.destination_id)?.name ?? ""),
    address: addressOf(byId.get(d.destination_id) ?? {}),
    lines: d.lines.map((l) => ({ line_id: l.line_id, title: titleOf.get(l.line_id) ?? "Item", quantity: l.quantity })),
  }))
}
