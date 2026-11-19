import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { getPostHog } from "../../../../../../../../lib/posthog"
import { addScpLinesToCart } from "../../../../../../../../lib/scp-add-lines"
import {
  applyTeamDetailsToCart,
  buildRangeOrderLines,
  loadOwnCart,
  rangeSetupFees,
} from "../../../../../../../../services/org-range"
import { requireMembership, requireRole } from "../../../_helpers"
import { parseBody, rangeItemsSchema } from "../_schema"

const bodySchema = z.object({
  cart_id: z.string().min(1).max(80),
  items: rangeItemsSchema,
  roster: z.union([z.literal("all"), z.array(z.string().min(1).max(80)).max(1000), z.null()]).optional(),
  packing: z.string().max(20).nullable().optional(),
  personalisation_requested: z.boolean().optional(),
})

/**
 * POST /store/customers/me/organisations/:id/range/add-to-cart
 *   { cart_id, items: [{ design_id, variant_id, quantity }],
 *     roster?: "all" | [roster_member_id] | null, packing?: "bulk" | "by_size" | "by_unit" | "individual",
 *     personalisation_requested?: boolean }
 *   → { added_lines, fee_lines_added, fees_for_staff: [title] }
 *
 * The one-screen order form's "Add all to cart" (owner / purchaser). The
 * server builds every line from the STORED design — the browser only says
 * which design, which size and how many — and prices it like a Studio add
 * (addScpLinesToCart), with the setup-fee lines a Studio add creates. All or
 * nothing: a line that can't be priced rejects the lot (422) before the cart
 * is touched. Lines carry `metadata.organisation_id`; the cart gets
 * `organisation_id` and, when sent, the roster / packing / names request.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const body = parseBody(bodySchema, req.body)
  const cart = await loadOwnCart(req.scope, body.cart_id, membership.customer_id)
  const lines = await buildRangeOrderLines(req.scope, membership.organisation_id, body.items)

  // Who it's for is checked (and saved) first: a bad packing choice must not
  // leave lines in the cart with no roster.
  await applyTeamDetailsToCart(req.scope, cart, membership.organisation_id, {
    roster: body.roster,
    packing: body.packing,
    personalisation_requested: body.personalisation_requested,
  })

  let result: Awaited<ReturnType<typeof addScpLinesToCart>>
  try {
    result = await addScpLinesToCart(
      req.scope,
      cart.id,
      lines.map(({ design_id: _d, group_id: _g, ...line }) => line),
      { digitizingWaivers: true }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "These lines couldn't be priced."
    return res.status(422).json({ type: "pricing_failed", message })
  }

  // Setup fees. One that can't be added is reported, never dropped quietly.
  const fees = await rangeSetupFees(req.scope, lines, result.descriptors)
  const addable = fees.filter((f) => f.variant_id)
  const feesForStaff = fees.filter((f) => !f.variant_id).map((f) => f.title)
  let feeLinesAdded = 0
  if (addable.length) {
    try {
      await addToCartWorkflow(req.scope).run({
        input: {
          cart_id: cart.id,
          items: addable.map((f) => ({ variant_id: f.variant_id as string, quantity: f.quantity, metadata: f.metadata })),
        },
      })
      feeLinesAdded = addable.length
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`range add-to-cart: setup-fee add failed for cart ${cart.id}`, error)
      feesForStaff.push(...addable.map((f) => f.title))
    }
  }

  getPostHog()?.capture({
    distinctId: membership.customer_id,
    event: "range added to cart",
    properties: {
      organisation_id: membership.organisation_id,
      cart_id: cart.id,
      lines_added: result.items_added,
      total_quantity: lines.reduce((n, l) => n + l.quantity, 0),
      designs: new Set(lines.map((l) => l.design_id)).size,
      has_roster: !!body.roster,
      packing: body.packing ?? null,
      personalisation_requested: body.personalisation_requested === true,
    },
  })

  res.json({ added_lines: result.items_added, fee_lines_added: feeLinesAdded, fees_for_staff: feesForStaff })
}
