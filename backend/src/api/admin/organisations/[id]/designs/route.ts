import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../modules/organisation/service"

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB ceiling for thumbnail + print file

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

const fileService = (req: MedusaRequest) =>
  req.scope.resolve(Modules.FILE) as unknown as {
    createFiles: (
      data: { filename: string; mimeType: string; content: string }[]
    ) => Promise<Array<{ id: string; url: string }>>
  }

async function uploadIfPresent(
  req: MedusaRequest,
  upload: NonNullable<CreatePayload["thumbnail_upload"]>,
  pathPrefix: string
): Promise<string> {
  const base64 = upload.data_base64.replace(/^data:[^;]+;base64,/, "")
  const buffer = Buffer.from(base64, "base64")
  if (buffer.byteLength === 0) {
    throw new Error("Empty upload payload")
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("File exceeds 8 MB limit")
  }
  const safeName = `${pathPrefix}/${Date.now()}-${upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const uploaded = await fileService(req).createFiles([
    {
      filename: safeName,
      mimeType: upload.mime_type,
      content: base64,
    },
  ])
  const url = uploaded?.[0]?.url
  if (!url) throw new Error("Upload returned no URL")
  return url
}

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
      thumbnailUrl = await uploadIfPresent(
        req,
        body.thumbnail_upload,
        `organisation-designs/${id}/thumbnails`
      )
    }
    if (body.print_file_upload) {
      printFileUrl = await uploadIfPresent(
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

  res.status(201).json({ design: created[0] })
}
