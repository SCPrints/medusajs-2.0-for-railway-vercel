import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import {
  artworkProofRound,
  verifyArtworkApproval,
} from "../../../services/artwork-approval/sign"
import { decideProof } from "../../../services/artwork-approval/decide"
import { buildProofPayload } from "../../../services/artwork-approval/proof-payload"

const schema = z.object({
  order: z.string().min(1),
  sig: z.string().min(16).max(64),
  approved: z.boolean(),
  approver_name: z.string().max(200).optional(),
  comment: z.string().max(2000).optional(),
  pins: z.array(z.unknown()).max(20).optional(),
})

/**
 * GET  /store/artwork-approval?order=<id>&sig=<sig>
 *   → { order_display_id, status, latest_photo_url, current_artwork_stage }
 *
 * POST /store/artwork-approval
 *   body: { order, sig, approved, approver_name?, comment?, pins? }
 *   → { ok, status }
 *
 * The GET response is what the storefront /artwork-approval/[id]
 * page reads to render the proof view. POST records the decision and
 * — if approved — advances `artwork_stage` to `approved` (which fires
 * the existing artwork_stage_changed event for downstream emails/UI).
 *
 * Decisions are idempotent: once approved, subsequent POSTs only
 * update the comment / approver name. Rejection swings the order back
 * to `in_review` so staff know to fix it.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String((req.query?.order as string) ?? "")
  const sig = String((req.query?.sig as string) ?? "")
  if (!orderId || !sig) {
    return res.status(400).json({ error: "invalid_signature" })
  }
  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, { relations: ["items"] })
  } catch {
    // Same response as a bad signature so order ids aren't enumerable.
    return res.status(400).json({ error: "invalid_signature" })
  }
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  // The signature is bound to the current proof round: a link from an
  // earlier round (revised proof since) reads as expired on the storefront.
  if (!verifyArtworkApproval(orderId, artworkProofRound(meta), sig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }
  res.json(buildProofPayload(order))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(body.order)
  } catch {
    return res.status(400).json({ error: "invalid_signature" })
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  if (!verifyArtworkApproval(body.order, artworkProofRound(meta), body.sig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }

  const result = await decideProof(req.scope, order, body)
  if ("httpStatus" in result) {
    return res.status(result.httpStatus).json({ error: result.error, message: result.message })
  }
  res.json({ ok: true, status: result.status })
}
