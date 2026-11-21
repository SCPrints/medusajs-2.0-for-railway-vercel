import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { allowanceClosed } from "../../../../../../../../lib/allowance"
import { designChoices, loadAllowance, orgService } from "../../../../../../../../services/org-allowance"
import { requireMembership, requireRole } from "../../../_helpers"
import { parseBody } from "../../range/_schema"

/**
 * GET /store/customers/me/organisations/:id/allowances/:aid   (owner / purchaser)
 *   → { allowance: { id, name, unit, closes_at, closed, added_to_cart, cart_id,
 *         items: [{ design_id, per_person, name, thumbnail_url, product_title }] },
 *       people: [{ roster_member_id, name, unit, token, submitted_at, picks: [{ design_id, size, quantity }] }] }
 * `token` is the person's private link: /[countryCode]/allowance/<token>. 404 when
 * the allowance belongs to another organisation.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const a = await loadAllowance(req.scope, membership.organisation_id, req.params.aid)
  const service = orgService(req.scope)
  const picks = (await service.listOrganisationAllowancePicks({ allowance_id: a.id } as any, { take: 2000 })) as any[]
  const roster = picks.length
    ? ((await service.listOrganisationRosterMembers({ id: picks.map((p) => p.roster_member_id) } as any, { take: 2000 })) as any[])
    : []
  const byId = new Map(roster.map((r) => [r.id as string, r]))
  const choices = await designChoices(req.scope, membership.organisation_id, a.items.map((i) => i.design_id))
  res.json({
    allowance: {
      id: a.id,
      name: a.name,
      unit: a.unit ?? null,
      closes_at: a.closes_at ?? null,
      closed: allowanceClosed(a),
      added_to_cart: !!a.cart_id,
      cart_id: a.cart_id ?? null,
      items: a.items.map((i) => ({
        ...i,
        name: choices.get(i.design_id)?.name ?? "Design no longer in your range",
        thumbnail_url: choices.get(i.design_id)?.thumbnail_url ?? null,
        product_title: choices.get(i.design_id)?.product_title ?? null,
      })),
    },
    people: picks
      .map((p) => ({
        roster_member_id: p.roster_member_id,
        name: byId.get(p.roster_member_id)?.name ?? "Removed from roster",
        unit: byId.get(p.roster_member_id)?.unit ?? null,
        token: p.token,
        submitted_at: p.submitted_at ?? null,
        picks: p.picks ?? [],
      }))
      .sort((x, y) => String(x.name).localeCompare(String(y.name))),
  })
}

/**
 * POST /store/customers/me/organisations/:id/allowances/:aid  { closed: boolean }
 *   → { closed } — close it now, or open it again (unless it is already in a cart).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { closed } = parseBody(z.object({ closed: z.boolean() }), req.body)
  const a = await loadAllowance(req.scope, membership.organisation_id, req.params.aid)
  await orgService(req.scope).updateOrganisationAllowances([{ id: a.id, status: closed ? "closed" : "open" } as any])
  res.json({ closed })
}
