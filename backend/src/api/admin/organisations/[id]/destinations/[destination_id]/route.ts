import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../modules/organisation/service"
import { revalidateOrgTags } from "../../../../../../lib/storefront-revalidate"

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(80).nullable().optional(),
  address_1: z.string().min(1).max(200).optional(),
  address_2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(120).optional(),
  province: z.string().max(80).nullable().optional(),
  postal_code: z.string().min(1).max(20).optional(),
  country_code: z.string().min(2).max(8).optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_phone: z.string().max(80).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  delivery_notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const destId = req.params.destination_id
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    const destination = await service.retrieveOrganisationDestination(destId)
    res.json({ destination })
  } catch {
    res.status(404).json({ error: "not_found" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const destId = req.params.destination_id
  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  let existing: any
  try {
    existing = await service.retrieveOrganisationDestination(destId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (existing.organisation_id !== id) {
    return res.status(404).json({ error: "not_found" })
  }
  const update: Record<string, unknown> = { id: destId }
  for (const key of Object.keys(body) as Array<keyof typeof body>) {
    if (body[key] !== undefined) (update as any)[key] = body[key]
  }
  await service.updateOrganisationDestinations([update as any])
  const fresh = await service.retrieveOrganisationDestination(destId)
  void revalidateOrgTags(id, ["destinations"])
  res.json({ destination: fresh })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const destId = req.params.destination_id
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  let existing: any
  try {
    existing = await service.retrieveOrganisationDestination(destId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (existing.organisation_id !== id) {
    return res.status(404).json({ error: "not_found" })
  }
  await service.updateOrganisationDestinations([
    { id: destId, is_active: false } as any,
  ])
  void revalidateOrgTags(id, ["destinations"])
  res.json({ ok: true })
}
