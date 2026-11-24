import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { allowanceClosed, cleanAllowanceItems } from "../../../../../../../lib/allowance"
import { designChoices, newAllowanceToken, orgService } from "../../../../../../../services/org-allowance"
import { requireMembership, requireRole } from "../../_helpers"
import { parseBody } from "../range/_schema"

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** YYYY-MM-DD; the allowance stays open all that day (Sydney time, to the nearest hour). */
  closes_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  unit: z.string().trim().max(120).nullable().optional(),
  items: z.array(z.object({ design_id: z.string().min(1).max(80), per_person: z.coerce.number().int().min(1).max(20) })).min(1).max(20),
  /** "ongoing" = new-starter pack: people are added one at a time and each is ordered on their own. */
  kind: z.enum(["batch", "ongoing"]).optional(),
  /** "home" = each person gives a delivery address (gift links). */
  delivery: z.enum(["bulk", "home"]).optional(),
})

const kindOf = (b: { kind?: "batch" | "ongoing" }) => b.kind ?? "batch"

/**
 * GET /store/customers/me/organisations/:id/allowances   (owner / purchaser)
 *   → { allowances: [{ id, name, unit, closes_at, closed, items, people, picked, added_to_cart, created_at }] }
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const service = orgService(req.scope)
  const rows = (await service.listOrganisationAllowances(
    { organisation_id: membership.organisation_id } as any,
    { take: 100, order: { created_at: "DESC" } }
  )) as any[]
  const picks = rows.length
    ? ((await service.listOrganisationAllowancePicks({ allowance_id: rows.map((r) => r.id) } as any, { take: 20000 })) as any[])
    : []
  res.json({
    allowances: rows.map((r) => {
      const mine = picks.filter((p) => p.allowance_id === r.id)
      return {
        id: r.id,
        name: r.name,
        unit: r.unit ?? null,
        closes_at: r.closes_at ?? null,
        closed: allowanceClosed(r),
        kind: r.kind ?? "batch",
        delivery: r.delivery ?? "bulk",
        items: r.items ?? [],
        people: mine.length,
        picked: mine.filter((p) => p.submitted_at).length,
        added_to_cart: !!r.cart_id,
        created_at: r.created_at,
      }
    }),
  })
}

/**
 * POST /store/customers/me/organisations/:id/allowances
 *   { name, closes_on?, unit?, items: [{ design_id, per_person }], kind?, delivery? }
 *   → 201 { id }
 * Everyone active on the roster (or in `unit`) gets a private link. Designs
 * must be shared with THIS organisation and orderable (404 / 400 otherwise).
 * Batch: roster people added later are not added (make a new allowance).
 * Ongoing: may start empty; people are added with …/:aid/people.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const body = parseBody(bodySchema, req.body)
  const items = cleanAllowanceItems(body.items)
  const service = orgService(req.scope)

  const choices = await designChoices(req.scope, membership.organisation_id, items.map((i) => i.design_id))
  for (const i of items) {
    const c = choices.get(i.design_id)
    if (!c) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That design isn't in this organisation's range.")
    if (c.sizes.length === 0) throw new MedusaError(MedusaError.Types.INVALID_DATA, `"${c.name}" has no sizes to choose from.`)
  }

  // New-starter packs start empty: people are added one at a time (…/people).
  const people = kindOf(body) === "ongoing" ? [] : ((await service.listOrganisationRosterMembers(
    { organisation_id: membership.organisation_id, is_active: true, ...(body.unit ? { unit: body.unit } : {}) } as any,
    { take: 1000, order: { name: "ASC" } }
  )) as any[])
  const kind = kindOf(body)
  if (people.length === 0 && kind === "batch") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, body.unit ? "Nobody in that unit yet." : "Add people to your roster first.")
  }

  // ponytail: end of the day at +10:00 (no DST handling; an hour out for a few weeks a year)
  const closes_at = body.closes_on ? new Date(`${body.closes_on}T23:59:59+10:00`) : null
  const created = (await service.createOrganisationAllowances([
    {
      organisation_id: membership.organisation_id,
      name: body.name,
      unit: body.unit || null,
      closes_at,
      items,
      kind,
      delivery: body.delivery ?? "bulk",
      created_by: membership.customer_id,
    } as any,
  ])) as any[]
  if (people.length) await service.createOrganisationAllowancePicks(
    people.map((p) => ({ allowance_id: created[0].id, roster_member_id: p.id, token: newAllowanceToken(), picks: [] })) as any
  )
  res.status(201).json({ id: created[0].id })
}
