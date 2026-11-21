import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { picksToRangeItems, type AllowancePick } from "../../../../../../../../../lib/allowance"
import { designChoices, loadAllowance, orgService, variantForSize } from "../../../../../../../../../services/org-allowance"
import { addRangeToCart } from "../../../../../../../../../services/org-range/add-to-cart"
import { requireMembership, requireRole } from "../../../../_helpers"
import { parseBody } from "../../../range/_schema"

/**
 * POST /store/customers/me/organisations/:id/allowances/:aid/add-to-cart  { cart_id }
 *   → { cart_id, added_lines, fee_lines_added, fees_for_staff, left_out: [name], unmatched: [name], already_added }
 *
 * Adds everyone's picks to the buyer's own cart through the range add-to-cart
 * (prices, artwork, roster all from there). People who haven't picked are
 * returned in `left_out`. The allowance's cart_id is claimed in ONE statement
 * first, so a second call (double click, second tab) returns `already_added`
 * with the same cart_id and adds nothing. A failed add releases the claim.
 * 404: allowance of another organisation or cart not the caller's; 400: nobody
 * has picked yet; 422: a line couldn't be priced (nothing added).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { cart_id } = parseBody(z.object({ cart_id: z.string().min(1).max(80) }), req.body)
  const a = await loadAllowance(req.scope, membership.organisation_id, req.params.aid)
  if (a.cart_id) {
    return res.json({ cart_id: a.cart_id, added_lines: 0, fee_lines_added: 0, fees_for_staff: [], left_out: [], unmatched: [], already_added: true })
  }

  const service = orgService(req.scope)
  const rows = (await service.listOrganisationAllowancePicks({ allowance_id: a.id } as any, { take: 2000 })) as any[]
  const roster = rows.length
    ? ((await service.listOrganisationRosterMembers({ id: rows.map((r) => r.roster_member_id) } as any, { take: 2000 })) as any[])
    : []
  const nameOf = new Map(roster.map((r) => [r.id as string, r.name as string]))
  const chosen = rows.filter((r) => r.submitted_at && ((r.picks ?? []) as AllowancePick[]).some((p) => p.quantity > 0))
  const leftOut = rows.filter((r) => !chosen.includes(r)).map((r) => nameOf.get(r.roster_member_id) ?? "Removed from roster")
  if (chosen.length === 0) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Nobody has chosen sizes yet.")

  const choices = await designChoices(req.scope, membership.organisation_id, a.items.map((i) => i.design_id))
  const { items, unmatched } = picksToRangeItems(
    chosen.map((r) => ({ name: nameOf.get(r.roster_member_id) ?? "A person", picks: r.picks as AllowancePick[] })),
    (designId, size) => variantForSize(choices.get(designId), size)
  )
  if (items.length === 0) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Those sizes are no longer available.")

  // Claim, then add. Releasing on failure keeps a bad price from locking the allowance.
  const pg = req.scope.resolve<any>("__pg_connection__")
  const claim = await pg.raw(
    `update organisation_allowance set cart_id = ?, updated_at = now()
      where id = ? and cart_id is null and deleted_at is null returning id`,
    [cart_id, a.id]
  )
  if (!(claim?.rows?.length > 0)) {
    const fresh = await loadAllowance(req.scope, membership.organisation_id, a.id)
    return res.json({ cart_id: fresh.cart_id, added_lines: 0, fee_lines_added: 0, fees_for_staff: [], left_out: [], unmatched: [], already_added: true })
  }
  const release = () => pg.raw(`update organisation_allowance set cart_id = null where id = ?`, [a.id])
  try {
    const result = await addRangeToCart(req.scope, membership, { cart_id, items, roster: chosen.map((r) => r.roster_member_id) })
    if ("message" in result) {
      await release()
      return res.status(422).json({ type: "pricing_failed", message: result.message })
    }
    res.json({
      cart_id,
      added_lines: result.added_lines,
      fee_lines_added: result.fee_lines_added,
      fees_for_staff: result.fees_for_staff,
      left_out: leftOut,
      unmatched,
      already_added: false,
    })
  } catch (error) {
    await release()
    throw error
  }
}
