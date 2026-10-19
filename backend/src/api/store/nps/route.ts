import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { getPostHog } from "../../../lib/posthog"
import { verifyNpsRating } from "../../../services/nps-requests/sign"

const schema = z.object({
  order: z.string().min(1),
  score: z.coerce.number().int().min(1).max(5),
  sig: z.string().min(16).max(16),
  comment: z.string().max(1000).optional(),
})

/**
 * Records an NPS rating against an order's metadata. Public — no auth
 * — but the URL is HMAC-signed (see `services/nps-requests/sign.ts`)
 * so customers can't tamper with the score. Idempotent: the first
 * recorded score sticks; subsequent submissions only update the
 * `comment` field.
 *
 * Only POST writes. GET just verifies the signature so a link preview or
 * mail-security scanner following the URL can't submit a score on the
 * customer's behalf (review 4-8); the email links to the storefront /nps
 * page, which POSTs after render.
 */
const recordScore = async (
  req: MedusaRequest,
  parsed: { order: string; score: number; sig: string; comment?: string }
): Promise<{ ok: boolean; first?: boolean; reason?: string }> => {
  if (!verifyNpsRating(parsed.order, parsed.score, parsed.sig)) {
    return { ok: false, reason: "invalid_signature" }
  }
  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)

  let order: any
  try {
    order = await orderModuleService.retrieveOrder(parsed.order)
  } catch {
    return { ok: false, reason: "not_found" }
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const existing = meta.nps_score
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = { ...meta }
  if (typeof existing !== "number") {
    updates.nps_score = parsed.score
    updates.nps_recorded_at = now
  }
  if (typeof parsed.comment === "string" && parsed.comment.length > 0) {
    updates.nps_comment = parsed.comment
  }
  updates.nps_last_seen_at = now

  await orderModuleService.updateOrders(parsed.order, { metadata: updates })

  getPostHog()?.capture({
    distinctId: order?.email ?? parsed.order,
    event: "nps response captured",
    properties: {
      order_id: parsed.order,
      score: parsed.score,
      first_response: typeof existing !== "number",
      has_comment: typeof parsed.comment === "string" && parsed.comment.length > 0,
    },
  })

  return { ok: true, first: typeof existing !== "number" }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const parsed = schema.parse({
      order: req.query.order,
      score: req.query.score,
      sig: req.query.sig,
    })
    if (!verifyNpsRating(parsed.order, parsed.score, parsed.sig)) {
      res.status(400).json({ success: false, message: "invalid_signature" })
      return
    }
    // Read-only: valid link, nothing recorded. POST to record.
    res.json({ success: true, valid: true, order: parsed.order, score: parsed.score })
  } catch (err: any) {
    res
      .status(400)
      .json({ success: false, message: err?.message ?? "invalid request" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const parsed = schema.parse({
      order: body.order ?? req.query.order,
      score: body.score ?? req.query.score,
      sig: body.sig ?? req.query.sig,
      comment: body.comment,
    })
    const result = await recordScore(req, parsed)
    if (!result.ok) {
      res
        .status(400)
        .json({ success: false, message: result.reason ?? "invalid" })
      return
    }
    res.json({ success: true, first_response: result.first })
  } catch (err: any) {
    res
      .status(400)
      .json({ success: false, message: err?.message ?? "invalid request" })
  }
}
