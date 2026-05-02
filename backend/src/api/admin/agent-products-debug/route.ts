import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

const bodySchema = z.object({
  hypothesisId: z.string().max(48),
  message: z.string().max(300),
  /** Nested arrays/objects from client — avoid strict z.record() rejecting valid payloads. */
  data: z.any().optional(),
})

/**
 * POST /admin/agent-products-debug
 *
 * Development / incident aid: logs one JSON line per request to process stdout (e.g. Railway logs).
 * Called from the admin Products debug widget with session auth. Payloads are bounded and contain
 * no secrets by design — pass only structural field diagnostics.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ ok: false })
    return
  }

  const line = JSON.stringify({
    tag: "ADMIN_AGENT_PRODUCTS_DEBUG",
    ts: new Date().toISOString(),
    hypothesisId: parsed.data.hypothesisId,
    message: parsed.data.message,
    data: parsed.data.data ?? {},
  })
  console.info(line)

  res.status(200).json({ ok: true })
}
