import type { MedusaContainer } from "@medusajs/framework/types"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"

import { cleanNamesNumbers, namesNumbersLabel, namesNumbersUnitMajor } from "../../lib/names-numbers"
import { serviceLineVariantId } from "../org-allowance/home-delivery"

import { getPostHog } from "../../lib/posthog"
import { addScpLinesToCart } from "../../lib/scp-add-lines"
import { applyTeamDetailsToCart, buildRangeOrderLines, loadOwnCart, rangeSetupFees } from "./index"

export type RangeAddInput = {
  cart_id: string
  items: Array<{ design_id: string; variant_id: string; quantity: number }>
  roster?: "all" | string[] | null
  packing?: string | null
  personalisation_requested?: boolean
  /** Names / numbers at these print sizes — charged per garment as one line. */
  names_numbers?: unknown
}

export type RangeAddResult =
  | { ok: true; added_lines: number; fee_lines_added: number; fees_for_staff: string[] }
  | { ok: false; message: string }

/**
 * Build every line from the STORED designs and add them to the customer's own
 * cart, priced like a Studio add, with setup-fee lines. All or nothing: a line
 * that can't be priced rejects the lot before the cart is touched. Shared by
 * range/add-to-cart and the uniform allowance's "Add everything to cart".
 * Throws MedusaError for 404 / invalid data; `{ ok: false }` = could not price (422).
 */
export async function addRangeToCart(
  scope: MedusaContainer,
  membership: { customer_id: string; organisation_id: string },
  body: RangeAddInput,
  /** Server-set keys for every line added (garments, setup fees, names), e.g. `{ home_delivery: true }`. */
  extraMetadata?: Record<string, unknown>
): Promise<RangeAddResult> {
  const cart = await loadOwnCart(scope, body.cart_id, membership.customer_id)
  const lines = await buildRangeOrderLines(scope, membership.organisation_id, body.items)
  const namesNumbers = cleanNamesNumbers(body.names_numbers)

  // Who it's for is checked (and saved) first: a bad packing choice must not
  // leave lines in the cart with no roster.
  await applyTeamDetailsToCart(scope, cart, membership.organisation_id, {
    roster: body.roster,
    packing: body.packing,
    personalisation_requested: body.personalisation_requested,
    ...(body.names_numbers !== undefined ? { names_numbers: namesNumbers } : {}),
  })

  let result: Awaited<ReturnType<typeof addScpLinesToCart>>
  try {
    result = await addScpLinesToCart(
      scope,
      cart.id,
      lines.map(({ design_id: _d, group_id: _g, ...line }) => line),
      { digitizingWaivers: true, extraMetadata }
    )
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "These lines couldn't be priced." }
  }

  // Setup fees. One that can't be added is reported, never dropped quietly.
  const fees = await rangeSetupFees(scope, lines, result.descriptors)
  const addable = fees.filter((f) => f.variant_id)
  const feesForStaff = fees.filter((f) => !f.variant_id).map((f) => f.title)
  let feeLinesAdded = 0
  if (addable.length) {
    try {
      await addToCartWorkflow(scope).run({
        input: {
          cart_id: cart.id,
          items: addable.map((f) => ({ variant_id: f.variant_id as string, quantity: f.quantity, metadata: { ...f.metadata, ...extraMetadata } })),
        },
      })
      feeLinesAdded = addable.length
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`range add-to-cart: setup-fee add failed for cart ${cart.id}`, error)
      feesForStaff.push(...addable.map((f) => f.title))
    }
  }

  // Names / numbers: one service line, priced as prints of the chosen size at
  // this order's quantity band. Not added = staff price it (flagged on the order).
  if (namesNumbers) {
    const garments = lines.reduce((n, l) => n + l.quantity, 0)
    try {
      const variantId = await serviceLineVariantId(scope)
      const label = namesNumbersLabel(namesNumbers)
      await addToCartWorkflow(scope).run({
        input: {
          cart_id: cart.id,
          items: [
            {
              variant_id: variantId,
              quantity: garments,
              unit_price: namesNumbersUnitMajor(namesNumbers, garments),
              title: label,
              product_title: "Names and numbers",
              variant_title: label,
              metadata: {
                names_numbers: namesNumbers,
                organisation_id: membership.organisation_id,
                // Server-priced from the print card; the checkout check leaves it be.
                price_override: { source: "names_numbers", garments },
                ...extraMetadata,
              },
            } as any,
          ],
        },
      })
      feeLinesAdded++
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`range add-to-cart: names line failed for cart ${cart.id}`, error)
      feesForStaff.push("Names and numbers")
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
      names_numbers: namesNumbers ? namesNumbersLabel(namesNumbers) : null,
    },
  })

  return { ok: true, added_lines: result.items_added, fee_lines_added: feeLinesAdded, fees_for_staff: feesForStaff }
}
