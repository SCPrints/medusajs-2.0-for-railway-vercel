import { randomUUID } from "crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { getPostHog } from "../../../../../../../lib/posthog"
import {
  buildReorderLineMetadata,
  classifyReorderLines,
  linePrintSizeId,
  lineTitle,
  reorderNeedsApproval,
  setupFeesByGroup,
  type NeedsStaff,
} from "../../../../../../../lib/reorder-lines"
import { requireCustomer } from "../../../../../../../lib/require-customer"
import { addScpLinesToCart, type ScpAddLineInput } from "../../../../../../../lib/scp-add-lines"
import { resolveTierForCartCustomer } from "../../../../../../../lib/scp-resolve-garment-unit-price"
import { approvedDesignFor, loadReorderableOrder } from "../../../../../../../services/reorder/load"

// The hidden setup-fee service products (scripts/seed-*-setup-product.ts);
// the Studio adds the same variants via NEXT_PUBLIC_*_SETUP_VARIANT_ID.
const SCREEN_SETUP_HANDLE = "screen-printing-setup-fee"
const SUPACOLOUR_SETUP_HANDLE = "supacolour-transfer-setup-fee"

const bodySchema = z.object({
  cart_id: z.string().min(1).max(80),
  line_ids: z.array(z.string().min(1).max(80)).max(300).optional(),
})

/**
 * POST /store/customers/me/orders/:id/order-again  { cart_id, line_ids? }
 *   → { added_lines, needs_staff: [{ line_item_id, title, reason }], used_approved_artwork,
 *       requires_approval?, approval_reason?: "needs_setup" | "quoted_price" }
 *
 * Copies the order's Studio lines into the customer's cart at today's
 * prices, through the same SCP pricing as a Studio add (addScpLinesToCart):
 * approved proof artwork swapped in, fresh group ids, `reorder_of` on each
 * line, and the screen / Supacolour setup-fee lines a fresh add creates.
 * All or nothing: when any chosen line needs setting up by hand, or carries
 * a quoted price and the customer has no pricing tier, NOTHING is added and
 * `requires_approval` comes back — the storefront sends the whole selection to
 * staff as one job (reorder-request).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "cart_id is required.")
  }
  const { cart_id, line_ids } = parsed.data

  const order = await loadReorderableOrder(req.scope, req.params.id, customerId)
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cart_id },
    fields: ["id", "customer_id", "completed_at", "metadata"],
  })
  const cart = carts?.[0] as
    | { id: string; customer_id?: string | null; completed_at?: unknown; metadata?: Record<string, unknown> | null }
    | undefined
  if (!cart || cart.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.")
  }
  if (cart.completed_at) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "That cart has already been checked out.")
  }

  const { design: designLines, needs_staff } = classifyReorderLines(order.items, line_ids)

  // One new group per original design group (lines of a bulk add share one).
  const groupKey = (l: (typeof designLines)[number]) =>
    String(l.metadata?.customizerDesign?.group_id || l.id)
  const groupSizes = new Map<string, number>()
  for (const l of designLines) groupSizes.set(groupKey(l), (groupSizes.get(groupKey(l)) ?? 0) + 1)
  const newGroupIds = new Map<string, string>()

  const items: Array<ScpAddLineInput & { group_id: string; old_group: string }> = []
  let usedApprovedArtwork = false
  for (const line of designLines) {
    const merged = await approvedDesignFor(order, line)
    const printSizeId = linePrintSizeId(line, merged.design)
    if (!printSizeId) {
      needs_staff.push({
        line_item_id: line.id,
        title: lineTitle(line),
        reason: "We couldn't tell which print size this line used.",
      })
      continue
    }
    const old = groupKey(line)
    const groupId = newGroupIds.get(old) ?? randomUUID()
    newGroupIds.set(old, groupId)
    if (merged.replacedSides.length) usedApprovedArtwork = true
    items.push({
      variant_id: line.variant_id as string,
      quantity: line.quantity ?? 1,
      print_size_id: printSizeId,
      metadata: buildReorderLineMetadata({
        line,
        design: merged.design,
        appliedProofs: merged.appliedProofs,
        groupId,
        groupSize: groupSizes.get(old) ?? 1,
        order: { id: order.id, display_id: order.display_id },
      }),
      group_id: groupId,
      old_group: old,
    })
  }

  // A job that needs our check goes to staff whole (the storefront follows up
  // with reorder-request) — nothing is put in the cart, so the customer never
  // ends up with half a job to pay for now and half on a quote.
  const tier = await resolveTierForCartCustomer(query as any, customerId)
  const approval = reorderNeedsApproval({ design: designLines, needs_staff, hasTier: !!tier })
  if (approval.required || items.length === 0) {
    return res.json({
      added_lines: 0,
      needs_staff,
      used_approved_artwork: false,
      requires_approval: true,
      approval_reason: approval.reason ?? "needs_setup",
    })
  }

  let result: Awaited<ReturnType<typeof addScpLinesToCart>>
  try {
    result = await addScpLinesToCart(
      req.scope,
      cart.id,
      items.map(({ group_id: _g, old_group: _o, ...item }) => item),
      { digitizingWaivers: true }
    )
  } catch (error) {
    // All-or-nothing: nothing was added. Say why, in the pricing's words.
    const message = error instanceof Error ? error.message : "These lines couldn't be priced."
    return res.status(422).json({ type: "pricing_failed", message })
  }

  // Setup fees, as syncScreenSetupLine / syncSupacolourSetupLine add them.
  // descriptors[i] ↔ items[i]: every item here is decorated.
  const fees = setupFeesByGroup(
    items.map((it, i) => ({ group_id: it.group_id, descriptor: result.descriptors[i] }))
  )
  const feeItems: Array<{ variant_id: string; quantity: number; metadata: Record<string, unknown>; title: string; old_group: string }> = []
  const needsScreen = fees.some((f) => f.screens > 0)
  const needsSupa = fees.some((f) => f.supacolour_designs > 0)
  const feeVariant = new Map<string, string>()
  if (needsScreen || needsSupa) {
    const { data: products } = await query.graph({
      entity: "product",
      filters: { handle: [SCREEN_SETUP_HANDLE, SUPACOLOUR_SETUP_HANDLE] },
      fields: ["handle", "variants.id"],
    })
    for (const p of (products ?? []) as Array<{ handle: string; variants?: Array<{ id: string }> }>) {
      if (p.variants?.[0]?.id) feeVariant.set(p.handle, p.variants[0].id)
    }
  }
  const oldGroupOf = new Map(items.map((it) => [it.group_id, it.old_group]))
  for (const f of fees) {
    const old = oldGroupOf.get(f.group_id) ?? ""
    if (f.screens > 0) {
      feeItems.push({
        variant_id: feeVariant.get(SCREEN_SETUP_HANDLE) ?? "",
        quantity: f.screens,
        metadata: { screen_setup_for_order: true, screen_setup_for_group: f.group_id },
        title: "Screen printing setup",
        old_group: old,
      })
    }
    if (f.supacolour_designs > 0) {
      feeItems.push({
        variant_id: feeVariant.get(SUPACOLOUR_SETUP_HANDLE) ?? "",
        quantity: f.supacolour_designs,
        metadata: { supacolour_setup_for_order: true, supacolour_setup_for_group: f.group_id },
        title: "Supacolour transfer setup",
        old_group: old,
      })
    }
  }

  // A fee that can't be added is never dropped quietly: it comes back for
  // staff (same soft-fail as the Studio, which leaves it to art review).
  const feeNeedsStaff = (fee: (typeof feeItems)[number]): NeedsStaff => {
    const source = order.items.find((l) => {
      const m = l.metadata ?? {}
      const key = fee.metadata.screen_setup_for_order ? m.screen_setup_for_group : m.supacolour_setup_for_group
      return key && key === fee.old_group
    })
    return {
      line_item_id: source?.id ?? "",
      title: fee.title,
      reason: "We couldn't add the setup fee automatically. We'll add it before production.",
    }
  }
  let feeLinesAdded = 0
  const addable = feeItems.filter((f) => f.variant_id)
  for (const f of feeItems) if (!f.variant_id) needs_staff.push(feeNeedsStaff(f))
  if (addable.length) {
    try {
      await addToCartWorkflow(req.scope).run({
        input: {
          cart_id: cart.id,
          items: addable.map(({ variant_id, quantity, metadata }) => ({ variant_id, quantity, metadata })),
        },
      })
      feeLinesAdded = addable.length
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`order-again: setup-fee add failed for order ${order.id}`, error)
      for (const f of addable) needs_staff.push(feeNeedsStaff(f))
    }
  }

  // An organisation's order stays the organisation's: checkout preselects it
  // ("Who is this order for?"). The order-placed subscriber re-checks membership.
  const orgId = order.metadata?.organisation_id
  if (typeof orgId === "string" && orgId && !cart.metadata?.organisation_id) {
    try {
      const cartModule = req.scope.resolve(Modules.CART) as any
      await cartModule.updateCarts(cart.id, { metadata: { ...(cart.metadata ?? {}), organisation_id: orgId } })
    } catch {
      /* the customer can still pick it at checkout */
    }
  }

  getPostHog()?.capture({
    distinctId: customerId,
    event: "order again",
    properties: {
      order_id: order.id,
      cart_id: cart.id,
      lines_added: result.items_added,
      fee_lines_added: feeLinesAdded,
      needs_staff: needs_staff.length,
      used_approved_artwork: usedApprovedArtwork,
    },
  })

  return res.json({
    added_lines: result.items_added + feeLinesAdded,
    needs_staff,
    used_approved_artwork: usedApprovedArtwork,
  })
}
