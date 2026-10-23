import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { resolveJobIds } from "../../../../../../services/jobs/build"

const schema = z.object({
  group_id: z.string().min(1).max(120),
  side: z.string().min(1).max(40),
  /** R2 URL from /admin/uploads; null clears it. */
  url: z.string().url().startsWith("http").nullable(),
})

/**
 * POST /admin/jobs/:id/dsp-pack/print-file { group_id, side, url } — sets (or
 * clears) staff's print-ready PDF/AI for one DSP position. Stored on
 * `order.metadata.dsp_print_files["<group>:<side>"]`; the proof places it as
 * vector at print size (services/dsp-pack/pdf.ts).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "group_id, side and url are required." })
  const { orderId } = await resolveJobIds(req.scope, req.params.id)
  if (!orderId) return res.status(404).json({ error: "This job has no order yet." })

  const orders = req.scope.resolve(Modules.ORDER) as any
  const order = await orders.retrieveOrder(orderId)
  const files = { ...((order.metadata?.dsp_print_files ?? {}) as Record<string, string>) }
  const key = `${parsed.data.group_id}:${parsed.data.side}`
  if (parsed.data.url) files[key] = parsed.data.url
  else delete files[key]
  // metadata replaces wholesale — spread it.
  await orders.updateOrders(orderId, { metadata: { ...(order.metadata ?? {}), dsp_print_files: files } })
  return res.json({ ok: true, dsp_print_files: files })
}
