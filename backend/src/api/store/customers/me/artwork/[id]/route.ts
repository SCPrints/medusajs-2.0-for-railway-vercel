import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { CUSTOMER_ARTWORK_MODULE } from "../../../../../../modules/customer-artwork"
import type CustomerArtworkModuleService from "../../../../../../modules/customer-artwork/service"
import {
  assertCanShareTo,
  listCustomerOrgs,
  sharingFields,
} from "../../../../../../lib/customer-org-sharing"
import { requireCustomer } from "../../../../../../lib/require-customer"

const paramsSchema = z.object({ id: z.string().min(1) })

const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    organisation_id: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.organisation_id !== undefined, {
    message: "Provide at least one field to update.",
  })

/** Owner-only load. Missing, hidden or someone else's → 404 (ids aren't enumerable). */
async function loadOwnedArtwork(req: AuthenticatedMedusaRequest, customerId: string) {
  const { id } = paramsSchema.parse(req.params ?? {})
  const service = req.scope.resolve<CustomerArtworkModuleService>(CUSTOMER_ARTWORK_MODULE)
  const [row] = (await service.listCustomerArtworks(
    { id, customer_id: customerId, hidden_at: null } as any,
    { take: 1 }
  )) as any[]
  if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artwork not found.")
  return { row, service }
}

/**
 * POST /store/customers/me/artwork/:id  { name?, organisation_id?: string|null }
 * → { artwork }. Owner only; sharing needs owner/purchaser role in that org.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const parsed = updateBodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((i) => i.message).join(", ")
    )
  }
  const body = parsed.data
  const { row, service } = await loadOwnedArtwork(req, customerId)
  const orgs = await listCustomerOrgs(req.scope, customerId)
  if (typeof body.organisation_id === "string") assertCanShareTo(orgs, body.organisation_id)

  const updated = await service.updateCustomerArtworks({
    id: row.id,
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.organisation_id !== undefined ? { organisation_id: body.organisation_id } : {}),
  } as any)

  res.json({ artwork: { ...updated, ...sharingFields(updated as any, customerId, orgs) } })
}

/** DELETE /store/customers/me/artwork/:id → { ok: true }. Hides the row (owner only). */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const { row, service } = await loadOwnedArtwork(req, customerId)
  await service.updateCustomerArtworks({ id: row.id, hidden_at: new Date() } as any)
  res.json({ ok: true })
}
