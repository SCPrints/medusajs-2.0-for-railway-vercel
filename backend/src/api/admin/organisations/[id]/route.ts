import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../modules/organisation"
import type OrganisationModuleService from "../../../../modules/organisation/service"
import { orgTier } from "../../../../lib/org-range-from-order"
import { applyOrganisationTier, dropOrganisationTier } from "../../../../services/organisation-tier"

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  abn: z.string().max(40).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  default_pricing_tier: z.string().max(60).nullable().optional(),
  tax_exempt: z.boolean().optional(),
  tax_exempt_reason: z.string().max(200).nullable().optional(),
  // Customer-of-record for fulfillment orders. See FULFILLMENT_PHASE_1_SPEC.md.
  primary_contact_customer_id: z
    .string()
    .min(1)
    .max(80)
    .nullable()
    .optional(),
  // Buying on account — staff-controlled (credit_limit: AUD inc GST, null = none).
  account_terms_enabled: z.boolean().optional(),
  account_terms_days: z.coerce.number().int().min(1).max(120).optional(),
  credit_limit: z.coerce.number().positive().max(10_000_000).nullable().optional(),
  ap_email: z.string().trim().email().max(200).nullable().optional(),
  // Optional tabs on the customer's organisation page. Hidden unless listed here.
  // shortcut: kept in metadata, not a column; move it if a third place needs to query it.
  portal_extras: z.array(z.enum(["allowance", "brand_kit"])).max(2).optional(),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  let org: any
  try {
    org = await service.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  const rows = (await service.listOrganisationMembers({ organisation_id: id }, { take: 500 })) as any[]
  // Who each member is, so staff see names, not customer ids.
  const customers = rows.length
    ? ((await (req.scope.resolve(Modules.CUSTOMER) as any).listCustomers(
        { id: rows.map((m) => m.customer_id) },
        { take: rows.length, select: ["id", "email", "first_name", "last_name", "company_name"] }
      )) as any[])
    : []
  const byId = new Map(customers.map((c) => [c.id, c]))
  const members = rows.map((m) => {
    const c = byId.get(m.customer_id)
    return {
      ...m,
      email: c?.email ?? null,
      name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
      company_name: c?.company_name ?? null,
    }
  })
  res.json({ organisation: org, members })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  if (body.default_pricing_tier && !orgTier(body.default_pricing_tier)) {
    return res.status(400).json({ error: `Unknown pricing tier "${body.default_pricing_tier}".` })
  }
  const update: Record<string, unknown> = { id }
  for (const k of Object.keys(body) as Array<keyof typeof body>) {
    if (body[k] !== undefined) (update as any)[k] = body[k]
  }
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const before: any = await service.retrieveOrganisation(id)
  if (body.portal_extras) {
    delete update.portal_extras
    update.metadata = { ...(before?.metadata ?? {}), portal_extras: body.portal_extras }
  }
  await service.updateOrganisations([update])
  // A changed (or cleared) tier: take back the old grant, then apply the new one to everyone.
  const tierChanged =
    body.default_pricing_tier !== undefined &&
    orgTier(before?.default_pricing_tier)?.name !== orgTier(body.default_pricing_tier)?.name
  if (tierChanged) await dropOrganisationTier(req.scope as any, id)
  const tier = body.default_pricing_tier ? await applyOrganisationTier(req.scope as any, id) : null
  const updated = await service.retrieveOrganisation(id)
  res.json({ organisation: updated, tier_members_added: tier?.added ?? 0 })
}

/**
 * DELETE /admin/organisations/:id
 * Takes back the organisation's pricing tier from its members, removes the
 * members and cancels open invites, then deletes the organisation. Without
 * this, ex-members kept its discount and could still open its pages.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  await dropOrganisationTier(req.scope as any, id)
  const members = (await service.listOrganisationMembers({ organisation_id: id } as any, { take: 1000 })) as any[]
  if (members.length) await service.deleteOrganisationMembers(members.map((m) => m.id))
  const invites = (await service.listOrganisationInvites({ organisation_id: id, accepted_at: null, revoked_at: null } as any, { take: 1000 })) as any[]
  if (invites.length) await service.updateOrganisationInvites(invites.map((i) => ({ id: i.id, revoked_at: new Date() })))
  // Saved drafts / approvals: left behind, they'd keep claiming their carts.
  const parked = (await service.listOrganisationCarts({ organisation_id: id } as any, { take: 1000 })) as any[]
  if (parked.length) await (service as any).deleteOrganisationCarts(parked.map((c) => c.id))
  await service.deleteOrganisations([id])
  res.json({ ok: true, members_removed: members.length, invites_cancelled: invites.length })
}
