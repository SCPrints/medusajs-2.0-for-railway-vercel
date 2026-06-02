import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { HOME_SECTION_MODULE } from "../../../../modules/home-section"
import type HomeSectionModuleService from "../../../../modules/home-section/service"

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(400).nullable().optional(),
  product_handles: z.array(z.string().max(200)).max(60).optional(),
  is_published: z.boolean().optional(),
  weight: z.coerce.number().int().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const update: Record<string, unknown> = { id }
  for (const k of Object.keys(body) as Array<keyof typeof body>) {
    if (body[k] === undefined) continue
    if (k === "product_handles") {
      update.product_handles = { handles: body.product_handles }
    } else {
      ;(update as any)[k] = body[k]
    }
  }

  const service = req.scope.resolve<HomeSectionModuleService>(
    HOME_SECTION_MODULE
  )
  await service.updateHomeSections([update])
  const updated = await service.retrieveHomeSection(id)
  res.json({ section: updated })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const service = req.scope.resolve<HomeSectionModuleService>(
    HOME_SECTION_MODULE
  )
  await service.deleteHomeSections([id])
  res.json({ ok: true })
}
