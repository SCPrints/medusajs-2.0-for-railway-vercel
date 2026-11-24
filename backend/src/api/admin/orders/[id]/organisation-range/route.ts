import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { addOrderToRange, getOrderRangeState } from "../../../../../services/org-range/from-order"

/**
 * GET  /admin/orders/:id/organisation-range
 *   → { customer_id, organisations: [{ id, name }], organisation_id, groups: [{ group_key, title, thumbnail, design_id }] }
 * POST /admin/orders/:id/organisation-range  { organisation_id, group_keys? }
 *   → { added, skipped, ...state }
 * Puts the job's designs (approved artwork) into the organisation's range and
 * tags the order to that organisation. Re-running adds only what's missing.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await getOrderRangeState(req.scope as any, req.params.id))
}

const bodySchema = z.object({
  organisation_id: z.string().min(1),
  group_keys: z.array(z.string().min(1)).max(200).nullable().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ message: "organisation_id is required." })
  const result = await addOrderToRange(req.scope as any, {
    orderId: req.params.id,
    organisationId: parsed.data.organisation_id,
    groupKeys: parsed.data.group_keys ?? null,
    actorId: (req as any).auth_context?.actor_id ?? null,
  })
  res.json({ ...result, ...(await getOrderRangeState(req.scope as any, req.params.id)) })
}
