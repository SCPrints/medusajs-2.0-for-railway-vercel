import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { allowanceClosed, matchSize, validatePicks, type AllowancePick } from "../../../../lib/allowance"
import { cleanHomeAddress } from "../../../../lib/home-delivery"
import { designChoices, orgService } from "../../../../services/org-allowance"

/**
 * Public, no login: a roster person's private allowance link. An unknown token
 * (or a person since removed) returns 404, so a guesser learns nothing; a real
 * link that has closed returns `closed: true`, read-only. Only this person's own name and picks come back — no prices,
 * no other people, no organisation details beyond the allowance's name.
 */
const notFound = (res: MedusaResponse) => res.status(404).json({ error: "not_found" })

async function load(req: MedusaRequest) {
  const token = String(req.params.token ?? "")
  if (token.length < 10 || token.length > 80) return null
  const service = orgService(req.scope)
  const [pick] = (await service.listOrganisationAllowancePicks({ token } as any, { take: 1 })) as any[]
  if (!pick) return null
  const [a] = (await service.listOrganisationAllowances({ id: pick.allowance_id } as any, { take: 1 })) as any[]
  if (!a) return null
  const [person] = (await service.listOrganisationRosterMembers({ id: pick.roster_member_id } as any, { take: 1 })) as any[]
  if (!person || person.is_active === false) return null
  // Ordered (their pack is in a cart) or closed: the holder of a real link sees
  // "closed" and what they chose, read-only. A guesser never gets this far.
  const closed = !!pick.cart_id || allowanceClosed(a)
  const items = (a.items ?? []) as Array<{ design_id: string; per_person: number }>
  const choices = await designChoices(req.scope, a.organisation_id, items.map((i) => i.design_id))
  return { service, pick, a, person, items, choices, closed }
}

/**
 * GET /store/allowance/:token
 *   → { allowance: { name, closes_at, delivery }, person: { name }, address,
 *       items: [{ design_id, name, thumbnail_url, product_title, per_person, sizes, suggested_size }],
 *       picks: [{ design_id, size, quantity }], submitted: boolean }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const ctx = await load(req)
  if (!ctx) return notFound(res)
  const { a, person, items, choices, pick } = ctx
  res.json({
    allowance: { name: a.name, closes_at: a.closes_at ?? null, delivery: a.delivery ?? "bulk" },
    person: { name: person.name },
    // Their own delivery address (home delivery only) — they typed it.
    address: a.delivery === "home" ? pick.address ?? null : null,
    items: items.map((i) => {
      const c = choices.get(i.design_id)
      return {
        design_id: i.design_id,
        name: c?.name ?? "Item",
        thumbnail_url: c?.thumbnail_url ?? null,
        product_title: c?.product_title ?? null,
        per_person: i.per_person,
        sizes: c?.sizes ?? [],
        suggested_size: c?.garment_group ? matchSize((person.sizes ?? {})[c.garment_group], c.sizes) : null,
      }
    }),
    picks: pick.picks ?? [],
    submitted: !!pick.submitted_at,
    closed: ctx.closed,
  })
}

const bodySchema = z.object({
  picks: z
    .array(z.object({ design_id: z.string().min(1).max(80), size: z.string().min(1).max(40), quantity: z.coerce.number().int().min(0).max(20) }))
    .max(60),
  /** Home delivery: where their pack goes (lib/home-delivery.ts). */
  address: z.record(z.string(), z.unknown()).optional(),
})

/**
 * POST /store/allowance/:token  { picks: [{ design_id, size, quantity }], address? }
 *   → { ok: true, picks }  (400 { error } when over the entitlement or a bad size)
 * Replaces this person's picks. Allowed until the allowance closes.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ctx = await load(req)
  if (!ctx) return notFound(res)
  if (ctx.closed) return res.status(409).json({ error: "Choices for this have closed." })
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Check your choices and try again." })
  const sizesByDesign: Record<string, string[]> = {}
  for (const [id, c] of Array.from(ctx.choices)) sizesByDesign[id] = c.sizes
  const checked = validatePicks(ctx.items, parsed.data.picks as AllowancePick[], sizesByDesign)
  if ("error" in checked) return res.status(400).json({ error: checked.error })
  let address = null
  if (ctx.a.delivery === "home") {
    const cleaned = cleanHomeAddress(parsed.data.address)
    if ("error" in cleaned) return res.status(400).json({ error: cleaned.error })
    address = cleaned.address
  }
  await ctx.service.updateOrganisationAllowancePicks([
    { id: ctx.pick.id, picks: checked.picks, submitted_at: new Date(), ...(address ? { address } : {}) } as any,
  ])
  res.json({ ok: true, picks: checked.picks })
}
