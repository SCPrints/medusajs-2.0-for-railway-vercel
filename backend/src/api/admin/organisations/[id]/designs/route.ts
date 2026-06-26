import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../modules/organisation/service"
import { revalidateOrgTags } from "../../../../../lib/storefront-revalidate"
import { uploadOrgDesignFile } from "../../../../../lib/org-design-upload"

const uploadShape = z
  .object({
    filename: z.string().min(1).max(200),
    mime_type: z.string().min(1).max(120),
    data_base64: z.string().min(1),
  })
  .optional()

const createSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(80).nullable().optional(),
  thumbnail_url: z.string().url().optional(),
  thumbnail_upload: uploadShape,
  print_file_url: z.string().url().nullable().optional(),
  print_file_upload: uploadShape,
  customizer_metadata: z.any().nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

type CreatePayload = z.infer<typeof createSchema>

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const activeOnly = req.query?.active === "1" || req.query?.active === "true"
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)

  // Verify org exists
  try {
    await service.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }

  const filters: Record<string, unknown> = { organisation_id: id }
  if (activeOnly) filters.is_active = true

  const designs = await service.listOrganisationDesigns(filters, {
    take: 200,
    order: { created_at: "DESC" },
  })

  res.json({ designs })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: CreatePayload
  try {
    body = createSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  // Need at least one of {thumbnail_url, thumbnail_upload}
  if (!body.thumbnail_url && !body.thumbnail_upload) {
    return res.status(400).json({
      error: "Either thumbnail_url or thumbnail_upload is required",
    })
  }

  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    await service.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "organisation not found" })
  }

  let thumbnailUrl = body.thumbnail_url ?? ""
  let printFileUrl: string | null = body.print_file_url ?? null

  try {
    if (body.thumbnail_upload) {
      thumbnailUrl = await uploadOrgDesignFile(
        req,
        body.thumbnail_upload,
        `organisation-designs/${id}/thumbnails`
      )
    }
    if (body.print_file_upload) {
      printFileUrl = await uploadOrgDesignFile(
        req,
        body.print_file_upload,
        `organisation-designs/${id}/print-files`
      )
    }
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "upload failed" })
  }

  const created = await service.createOrganisationDesigns([
    {
      organisation_id: id,
      name: body.name,
      code: body.code ?? null,
      thumbnail_url: thumbnailUrl,
      print_file_url: printFileUrl,
      customizer_metadata: body.customizer_metadata ?? null,
      is_active: body.is_active ?? true,
      metadata: body.metadata ?? {},
    },
  ])

  // Fire-and-forget cache purge to the storefront
  void revalidateOrgTags(id, ["designs"])

  res.status(201).json({ design: created[0] })
}
