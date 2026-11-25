import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { picksToRangeItems, type AllowancePick } from "../../../../../../../../../lib/allowance"
import { designChoices, loadAllowance, orgService, variantForSize } from "../../../../../../../../../services/org-allowance"
import { addHomeDeliveryPostage } from "../../../../../../../../../services/org-allowance/home-delivery"
import { addRangeToCart } from "../../../../../../../../../services/org-range/add-to-cart"
import { requireMembership, requireRole } from "../../../../_helpers"
import { parseBody } from "../../../range/_schema"

/**
 * POST /store/customers/me/organisations/:id/allowances/:aid/add-to-cart  { cart_id, roster_member_id? }
 *   → { cart_id, added_lines, fee_lines_added, fees_for_staff, left_out: [name], unmatched: [name], already_added, postage }
 *
 * Adds the picks to the buyer's own cart through the range add-to-cart
 * (prices, artwork, roster all from there).
 * - Batch: everyone who picked, once. The allowance's cart_id is claimed in ONE
 *   statement first, so a second call returns `already_added` and adds nothing.
 * - Ongoing (new-starter pack): just `roster_member_id`, claimed on their pick;
 *   the pack stays open for the next person.
 * - Home delivery: people without an address are left out; one postage line
 *   ("Delivery to N addresses") is added and the cart's own shipping is $0.
 * A failed add releases the claim. 404: allowance of another organisation or
 * cart not the caller's; 400: nobody ready; 422: a line couldn't be priced.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { cart_id, roster_member_id } = parseBody(
    z.object({ cart_id: z.string().min(1).max(80), roster_member_id: z.string().min(1).max(80).optional() }),
    req.body
  )
  const a = await loadAllowance(req.scope, membership.organisation_id, req.params.aid)
  const ongoing = a.kind === "ongoing"
  const home = a.delivery === "home"
  const done = (cartId: string | null) =>
    res.json({ cart_id: cartId, added_lines: 0, fee_lines_added: 0, fees_for_staff: [], left_out: [], unmatched: [], already_added: true, postage: 0 })
  if (ongoing && !roster_member_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose whose pack to order.")
  if (!ongoing && a.cart_id) return done(a.cart_id)

  const service = orgService(req.scope)
  const rows = (await service.listOrganisationAllowancePicks(
    { allowance_id: a.id, ...(ongoing ? { roster_member_id } : {}) } as any,
    { take: 2000 }
  )) as any[]
  if (ongoing && !rows.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That person doesn't have a link on this pack.")
  if (ongoing && rows[0].cart_id) return done(rows[0].cart_id)
  const roster = rows.length
    ? ((await service.listOrganisationRosterMembers({ id: rows.map((r) => r.roster_member_id) } as any, { take: 2000 })) as any[])
    : []
  const nameOf = new Map(roster.map((r) => [r.id as string, r.name as string]))
  const chosen = rows.filter(
    (r) => r.submitted_at && ((r.picks ?? []) as AllowancePick[]).some((p) => p.quantity > 0) && (!home || r.address)
  )
  // Each with why, so "chose nothing" doesn't read as "hasn't answered".
  const leftOut = rows
    .filter((r) => !chosen.includes(r))
    .map((r) => {
      const name = nameOf.get(r.roster_member_id) ?? "Removed from roster"
      const why = !r.submitted_at
        ? "hasn't chosen yet"
        : !((r.picks ?? []) as AllowancePick[]).some((p) => p.quantity > 0)
        ? "chose nothing"
        : "no address yet"
      return `${name} (${why})`
    })
  if (chosen.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, ongoing ? "They haven't chosen their sizes yet." : "Nobody has chosen sizes yet.")
  }

  const choices = await designChoices(req.scope, membership.organisation_id, a.items.map((i) => i.design_id))
  const { items, unmatched } = picksToRangeItems(
    chosen.map((r) => ({ name: nameOf.get(r.roster_member_id) ?? "A person", picks: r.picks as AllowancePick[] })),
    (designId, size) => variantForSize(choices.get(designId), size)
  )
  if (items.length === 0) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Those sizes are no longer available.")

  // Claim, then add. Releasing on failure keeps a bad price from locking it.
  const pg = req.scope.resolve<any>("__pg_connection__")
  const table = ongoing ? "organisation_allowance_pick" : "organisation_allowance"
  const claimId = ongoing ? rows[0].id : a.id
  const claim = await pg.raw(
    `update ${table} set cart_id = ?, updated_at = now() where id = ? and cart_id is null and deleted_at is null returning id`,
    [cart_id, claimId]
  )
  if (!(claim?.rows?.length > 0)) {
    const [fresh] = (await pg.raw(`select cart_id from ${table} where id = ?`, [claimId]))?.rows ?? []
    return done(fresh?.cart_id ?? null)
  }
  const release = () => pg.raw(`update ${table} set cart_id = null where id = ?`, [claimId])
  try {
    const result = await addRangeToCart(
      req.scope,
      membership,
      { cart_id, items, roster: chosen.map((r) => r.roster_member_id) },
      home ? { home_delivery: true } : undefined
    )
    if ("message" in result) {
      await release()
      return res.status(422).json({ type: "pricing_failed", message: result.message })
    }
    let postage = 0
    if (home) {
      try {
        postage = await addHomeDeliveryPostage(
          req.scope,
          cart_id,
          chosen.map((r) => ({ name: nameOf.get(r.roster_member_id) ?? "A person", address: r.address, picks: r.picks as AllowancePick[] })),
          choices
        )
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`allowance add-to-cart: postage failed for cart ${cart_id}`, error)
        result.fees_for_staff.push("Home delivery postage")
      }
    }
    res.json({
      cart_id,
      added_lines: result.added_lines,
      fee_lines_added: result.fee_lines_added,
      fees_for_staff: result.fees_for_staff,
      left_out: leftOut,
      unmatched,
      already_added: false,
      postage,
    })
  } catch (error) {
    await release()
    throw error
  }
}
