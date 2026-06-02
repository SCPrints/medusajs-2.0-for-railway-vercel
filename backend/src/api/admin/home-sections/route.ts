import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { HOME_SECTION_MODULE } from "../../../modules/home-section"
import type HomeSectionModuleService from "../../../modules/home-section/service"

const createSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).optional(),
  handle: z.string().max(120).optional(),
  product_handles: z.array(z.string().max(200)).max(60).optional(),
  is_published: z.boolean().optional(),
  weight: z.coerce.number().int().optional(),
})

function slugify(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const includeUnpublished =
    String(req.query.include_unpublished ?? "").toLowerCase() === "true"
  const service = req.scope.resolve<HomeSectionModuleService>(
    HOME_SECTION_MODULE
  )
  const sections = await service.listHomeSections(
    includeUnpublished ? {} : { is_published: true },
    { order: { weight: "ASC" }, take: 200 }
  )
  res.json({
    sections: (sections as any[]).map((s) => ({
      id: s.id,
      handle: s.handle,
      title: s.title,
      subtitle: s.subtitle,
      product_handles: (s.product_handles as { handles?: string[] })?.handles ?? [],
      is_published: s.is_published,
      weight: s.weight,
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const service = req.scope.resolve<HomeSectionModuleService>(
    HOME_SECTION_MODULE
  )

  // Resolve a unique handle: explicit → slugified title → suffix on collision.
  const base = slugify(body.handle || body.title) || "section"
  let handle = base
  for (let i = 2; i < 50; i++) {
    const existing = await service.listHomeSections({ handle }, { take: 1 })
    if (!existing.length) break
    handle = `${base}-${i}`
  }

  const [created] = await service.createHomeSections([
    {
      handle,
      title: body.title,
      subtitle: body.subtitle ?? null,
      product_handles: { handles: body.product_handles ?? [] },
      is_published: body.is_published ?? true,
      weight: body.weight ?? 0,
      created_by: (req as any).auth_context?.actor_id ?? null,
    },
  ])

  res.status(201).json({ section: created })
}
