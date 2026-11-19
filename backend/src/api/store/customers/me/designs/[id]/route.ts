import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"

import { getPostHog } from "../../../../../../lib/posthog"
import {
  decorateDesigns,
  loadOwnedDesign,
  loadVisibleDesign,
} from "../../../../../../lib/owned-design"
import {
  assertCanShareTo,
  listCustomerOrgs,
} from "../../../../../../lib/customer-org-sharing"
import { requireCustomer } from "../../../../../../lib/require-customer"

const paramsSchema = z.object({ id: z.string().min(1) })

const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    thumbnail_url: z.string().url().nullable().optional(),
    customizer_metadata: z.record(z.string(), z.unknown()).optional(),
    /** Share with one of my organisations, or null to make private. Owner only. */
    organisation_id: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.thumbnail_url !== undefined ||
      v.customizer_metadata !== undefined ||
      v.organisation_id !== undefined,
    { message: "Provide at least one field to update." }
  )

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const params = paramsSchema.parse(req.params ?? {})
  // Readable when own or shared to one of my organisations.
  const { design, orgs } = await loadVisibleDesign(req.scope, params.id, customerId)
  const [decorated] = await decorateDesigns(req.scope, [design], customerId, orgs)
  res.json({ design: decorated })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const params = paramsSchema.parse(req.params ?? {})
  const body = updateBodySchema.parse(req.body ?? {})

  const { design, designsService } = await loadOwnedDesign(req.scope, params.id, customerId)

  // Sharing: only into an organisation where I'm owner or purchaser.
  // (The owner's own design needs no org list for its response fields.)
  const orgs =
    typeof body.organisation_id === "string" ? await listCustomerOrgs(req.scope, customerId) : []
  if (typeof body.organisation_id === "string") assertCanShareTo(orgs, body.organisation_id)

  // If the customizer payload is changing, snapshot the OLD state into
  // a design_version row before mutating the live design. Rename- and
  // thumbnail-only updates don't create a version (avoids polluting
  // the history with cosmetic changes).
  let snapshottedVersion: number | null = null
  if (body.customizer_metadata !== undefined) {
    const existingVersions = await designsService.listDesignVersions(
      { design_id: design.id },
      { order: { version: "DESC" }, take: 1 }
    )
    const nextVersion =
      ((existingVersions as Array<{ version: number }>)[0]?.version ?? 0) + 1
    await designsService.createDesignVersions([
      {
        design_id: design.id,
        customer_id: customerId,
        version: nextVersion,
        name: design.name,
        thumbnail_url: design.thumbnail_url ?? null,
        base_product_id: design.base_product_id ?? null,
        base_variant_id: design.base_variant_id ?? null,
        customizer_metadata: design.customizer_metadata,
      },
    ])
    snapshottedVersion = nextVersion
  }

  const [updated] = await designsService.updateDesigns([
    {
      id: design.id,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.thumbnail_url !== undefined ? { thumbnail_url: body.thumbnail_url } : {}),
      ...(body.customizer_metadata !== undefined
        ? { customizer_metadata: body.customizer_metadata }
        : {}),
      ...(body.organisation_id !== undefined ? { organisation_id: body.organisation_id } : {}),
    },
  ])

  getPostHog()?.capture({
    distinctId: customerId,
    event: "design updated",
    properties: {
      design_id: design.id,
      updated_name: body.name !== undefined,
      updated_thumbnail: body.thumbnail_url !== undefined,
      updated_metadata: body.customizer_metadata !== undefined,
      updated_sharing: body.organisation_id !== undefined,
      snapshotted_version: snapshottedVersion,
    },
  })

  const [decorated] = await decorateDesigns(req.scope, [updated], customerId, orgs)
  res.json({ design: decorated, snapshotted_version: snapshottedVersion })
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const params = paramsSchema.parse(req.params ?? {})
  const { design, designsService } = await loadOwnedDesign(req.scope, params.id, customerId)

  await designsService.deleteDesigns(design.id)

  getPostHog()?.capture({
    distinctId: customerId,
    event: "design deleted",
    properties: {
      design_id: design.id,
      design_name: design.name ?? null,
    },
  })

  res.json({ id: design.id, deleted: true })
}
