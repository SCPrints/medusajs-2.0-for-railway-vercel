import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../modules/organisation/service"

const createSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(80).nullable().optional(),
  address_1: z.string().min(1).max(200),
  address_2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(120),
  province: z.string().max(80).nullable().optional(),
  postal_code: z.string().min(1).max(20),
  country_code: z.string().min(2).max(8).optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_phone: z.string().max(80).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  delivery_notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const activeOnly = req.query?.active === "1" || req.query?.active === "true"
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    await service.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  const filters: Record<string, unknown> = { organisation_id: id }
  if (activeOnly) filters.is_active = true
  const destinations = await service.listOrganisationDestinations(filters, {
    take: 500,
    order: { name: "ASC" },
  })
  res.json({ destinations })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    await service.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "organisation not found" })
  }
  const created = await service.createOrganisationDestinations([
    {
      organisation_id: id,
      name: body.name,
      code: body.code ?? null,
      address_1: body.address_1,
      address_2: body.address_2 ?? null,
      city: body.city,
      province: body.province ?? null,
      postal_code: body.postal_code,
      country_code: body.country_code ?? "au",
      contact_name: body.contact_name ?? null,
      contact_phone: body.contact_phone ?? null,
      contact_email: body.contact_email ?? null,
      delivery_notes: body.delivery_notes ?? null,
      is_active: body.is_active ?? true,
      metadata: body.metadata ?? {},
    },
  ])
  res.status(201).json({ destination: created[0] })
}
