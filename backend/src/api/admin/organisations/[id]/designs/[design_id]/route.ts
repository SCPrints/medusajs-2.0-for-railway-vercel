import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../modules/organisation/service"
import { revalidateOrgTags } from "../../../../../../lib/storefront-revalidate"
import { uploadOrgDesignFile } from "../../../../../../lib/org-design-upload"

const uploadShape = z
  .object({
    filename: z.string().min(1).max(200),
    mime_type: z.string().min(1).max(120),
    data_base64: z.string().min(1),
  })
  .optional()

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(80).nullable().optional(),
  thumbnail_url: z.string().url().optional(),
  thumbnail_upload: uploadShape,
  print_file_url: z.string().url().nullable().optional(),
  print_file_upload: uploadShape,
  customizer_metadata: z.any().nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

type UpdatePayload = z.infer<typeof updateSchema>

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const designId = req.params.design_id
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    const design = await service.retrieveOrganisationDesign(designId)
    // Scope the read to the org in the URL — a design id from another org
    // must not be readable via this org's path (mirrors POST/DELETE below).
    if (design.organisation_id !== id) {
      return res.status(404).json({ error: "not_found" })
    }
    res.json({ design })
  } catch {
    res.status(404).json({ error: "not_found" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const designId = req.params.design_id
  let body: UpdatePayload
  try {
    body = updateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  let existing: any
  try {
    existing = await service.retrieveOrganisationDesign(designId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (existing.organisation_id !== id) {
    return res.status(404).json({ error: "not_found" })
  }

  const update: Record<string, unknown> = { id: designId }

  try {
    if (body.thumbnail_upload) {
      update.thumbnail_url = await uploadOrgDesignFile(
        req,
        body.thumbnail_upload,
        `organisation-designs/${id}/thumbnails`
      )
    } else if (body.thumbnail_url !== undefined) {
      update.thumbnail_url = body.thumbnail_url
    }

    if (body.print_file_upload) {
      update.print_file_url = await uploadOrgDesignFile(
        req,
        body.print_file_upload,
        `organisation-designs/${id}/print-files`
      )
    } else if (body.print_file_url !== undefined) {
      update.print_file_url = body.print_file_url
    }
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "upload failed" })
  }

  for (const key of [
    "name",
    "code",
    "customizer_metadata",
    "is_active",
    "metadata",
  ] as const) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  await service.updateOrganisationDesigns([update as any])
  const fresh = await service.retrieveOrganisationDesign(designId)
  void revalidateOrgTags(id, ["designs"])
  res.json({ design: fresh })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const designId = req.params.design_id
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  let existing: any
  try {
    existing = await service.retrieveOrganisationDesign(designId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (existing.organisation_id !== id) {
    return res.status(404).json({ error: "not_found" })
  }
  // Soft-delete via is_active toggle (preserves history)
  await service.updateOrganisationDesigns([
    { id: designId, is_active: false } as any,
  ])
  void revalidateOrgTags(id, ["designs"])
  res.json({ ok: true })
}
