import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"
import { z } from "zod"

import { LOOKBOOK_MODULE } from "../../../../modules/lookbook"
import type LookbookModuleService from "../../../../modules/lookbook/service"
import { revalidateStorefrontTags } from "../../../../lib/storefront-revalidate"

const MAX_BYTES = 8 * 1024 * 1024

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  attribution: z.string().max(200).nullable().optional(),
  order_id: z.string().max(120).nullable().optional(),
  product_handles: z.array(z.string().max(200)).max(20).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  is_published: z.boolean().optional(),
  weight: z.coerce.number().int().optional(),
  /** Replace the tile photo. A pre-uploaded URL or a fresh base64 data URL. */
  image_url: z.string().min(1).optional(),
  image_data_base64: z.string().optional(),
  image_filename: z.string().max(200).optional(),
  image_mime_type: z.string().max(80).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  // Optional image replacement — staff re-uploaded a photo. Same upload path as
  // create; absent → the existing image_url is left untouched.
  let replacementImageUrl = body.image_url
  if (!replacementImageUrl && body.image_data_base64) {
    try {
      const fileModuleService = req.scope.resolve(Modules.FILE) as any
      const base64 = body.image_data_base64.replace(/^data:[^;]+;base64,/, "")
      const buf = Buffer.from(base64, "base64")
      if (buf.byteLength > MAX_BYTES) {
        return res.status(413).json({ error: "image exceeds 8 MB" })
      }
      const filename = `lookbook/${ulid()}-${(body.image_filename ?? "image.jpg").replace(/[^a-zA-Z0-9._-]/g, "_")}`
      const [uploaded] = await fileModuleService.createFiles([
        {
          filename,
          mimeType: body.image_mime_type ?? "image/jpeg",
          content: base64,
        },
      ])
      replacementImageUrl = uploaded?.url
    } catch (err: any) {
      return res.status(500).json({ error: "upload_failed", detail: err?.message })
    }
  }

  const update: Record<string, unknown> = { id }
  for (const k of Object.keys(body) as Array<keyof typeof body>) {
    if (body[k] === undefined) continue
    if (k === "product_handles") {
      update.product_handles = { handles: body.product_handles }
    } else if (k === "tags") {
      update.tags = { values: body.tags }
    } else if (
      k === "image_data_base64" ||
      k === "image_filename" ||
      k === "image_mime_type"
    ) {
      // Upload inputs — not columns. The resolved URL is applied below.
      continue
    } else {
      ;(update as any)[k] = body[k]
    }
  }
  if (replacementImageUrl) {
    update.image_url = replacementImageUrl
  }

  const service = req.scope.resolve<LookbookModuleService>(LOOKBOOK_MODULE)
  await service.updateLookbookItems([update])
  const updated = await service.retrieveLookbookItem(id)

  // Purge the storefront's cached lookbook page so edits (details, photo,
  // product links, publish toggle) show up without waiting out cacheLife.
  void revalidateStorefrontTags(["lookbook"])

  res.json({ item: updated })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const service = req.scope.resolve<LookbookModuleService>(LOOKBOOK_MODULE)
  await service.deleteLookbookItems([id])
  void revalidateStorefrontTags(["lookbook"])
  res.json({ ok: true })
}
