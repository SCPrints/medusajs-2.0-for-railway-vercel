import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { GARMENTS, findStep, isGarmentType, roundCm, sizeStatus } from "../../../../lib/garment-measurements"
import { loadProductMeasurements } from "../../../../services/garment-measurements/load"

/**
 * GET  /admin/garment-measurements/:product_id — sizes, rows and per-size status for the measuring page.
 * POST /admin/garment-measurements/:product_id — save (or clear, with value_cm null) one value for one size.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { product, sizes, garment_type, rows } = await loadProductMeasurements(req, req.params.product_id)

  const userIds = Array.from(new Set(rows.map((r) => r.measured_by).filter((x): x is string => !!x)))
  const emails = new Map<string, string>()
  if (userIds.length) {
    const users = await req.scope.resolve(Modules.USER).listUsers({ id: userIds }, { select: ["id", "email"] })
    for (const u of users) emails.set(u.id, u.email)
  }

  res.json({
    product,
    sizes,
    garment_type,
    has_rows: rows.length > 0,
    status: Object.fromEntries(
      sizes.map((s) => [s, sizeStatus(garment_type, rows.filter((r) => r.size === s))])
    ),
    rows: rows.map((r) => ({
      size: r.size,
      key: r.key,
      value_cm: roundCm(Number(r.value_cm)),
      estimated: r.estimated,
      note: r.note,
      measured_by: r.measured_by ? emails.get(r.measured_by) ?? r.measured_by : null,
      measured_at: r.measured_at,
    })),
  })
}

const postSchema = z.object({
  garment_type: z.string(),
  size: z.string().trim().min(1).max(20),
  key: z.string().trim().min(1).max(60),
  value_cm: z.number().positive().max(500).nullable(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = postSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" })
  const body = parsed.data
  if (!isGarmentType(body.garment_type) || !findStep(body.garment_type, body.key))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown measurement "${body.key}" for ${body.garment_type}`)

  const productId = req.params.product_id
  const { service, rows } = await loadProductMeasurements(req, productId)
  const existing = rows.find((r) => r.size === body.size && r.key === body.key)

  if (body.value_cm === null) {
    if (existing) await service.deleteGarmentMeasurements(existing.id)
    return res.json({ ok: true, deleted: !!existing })
  }

  const data = {
    garment_type: body.garment_type,
    value_cm: roundCm(body.value_cm),
    estimated: false,
    note: body.note ?? existing?.note ?? null,
    measured_by: (req as any).auth_context?.actor_id ?? null,
    measured_at: new Date(),
  }
  if (existing) await service.updateGarmentMeasurements({ id: existing.id, ...data })
  else await service.createGarmentMeasurements({ product_id: productId, size: body.size, key: body.key, ...data })

  res.json({ ok: true, label: GARMENTS[body.garment_type].label })
}
