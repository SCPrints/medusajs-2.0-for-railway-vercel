import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { getPostHog } from "../../../../../lib/posthog"

/**
 * Staff-curated override of the "Customer Notes" box shown on the Mockup PDF.
 *
 * Why this exists: the PDF's Customer Notes box renders the customer's
 * order-time free text (`customizerDesign.printNotes`) verbatim. That text is
 * frozen at order placement, so when staff later correct a print size (via the
 * per-side `mockup_print_dimensions` override) the original note can contradict
 * the corrected dimension on the same page — e.g. the Back garment label reads
 * "297×225mm" while the note still says "Back size design: A3 format". This lets
 * staff edit what the proof shows (delete/fix the stale line, keep the genuine
 * instructions) so the proof has ONE source of truth.
 *
 * Stored per line item on the order:
 *   order.metadata.mockup_proof_notes = { "<line_item_id>": "edited notes" }
 *
 * Semantics (distinct from the per-side note/dimension maps):
 *   - key PRESENT (incl. empty string "")  → use this override on the PDF.
 *       "" means "show no Customer Notes box" (an intentional blank).
 *   - key ABSENT                           → fall back to the customer's
 *       original `customizerDesign.printNotes`.
 *   - DELETE removes the key  → "reset to the customer's original".
 */

const PROOF_NOTES_KEY = "mockup_proof_notes"

const upsertSchema = z.object({
  line_item_id: z.string().min(1),
  notes: z.string().max(2000),
})

/**
 * Preserve empty strings — unlike the studio-note / dimension maps, an empty
 * value here is a meaningful "show nothing" override, not a delete.
 */
function readNotesMap(meta: Record<string, unknown>): Record<string, string> {
  const raw = meta[PROOF_NOTES_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v
  }
  return out
}

/** GET /admin/orders/:id/proof-notes → { notes: { "<line>": string } } */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  if (!orderId) return res.status(400).json({ error: "id required" })

  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId)
  } catch {
    return res.status(404).json({ error: "Order not found" })
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  return res.json({ notes: readNotesMap(meta) })
}

/**
 * POST /admin/orders/:id/proof-notes
 *   body { line_item_id, notes } — upsert. Stores the string as-is (outer
 *   whitespace trimmed, internal newlines kept); an empty result is stored as
 *   an explicit "" so the PDF renders no Customer Notes box for that line.
 *   → { notes: { "<line>": string } }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  if (!orderId) return res.status(400).json({ error: "id required" })

  let parsed: z.infer<typeof upsertSchema>
  try {
    parsed = upsertSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Invalid request" })
  }

  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId)
  } catch {
    return res.status(404).json({ error: "Order not found" })
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  // Read-modify-write: Medusa replaces the whole metadata jsonb on update, so
  // spread the existing keys (revised_proofs, mockup_studio_notes,
  // mockup_print_dimensions, …) back in.
  const notes = readNotesMap(meta)
  notes[parsed.line_item_id] = parsed.notes.trim()

  try {
    await orderModuleService.updateOrders(orderId, {
      metadata: { ...meta, [PROOF_NOTES_KEY]: notes },
    })
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: "Failed to save notes", detail: String(err?.message ?? err) })
  }

  try {
    getPostHog()?.capture({
      distinctId: (req as any).auth_context?.actor_id ?? "admin",
      event: "mockup_proof_notes_saved",
      properties: {
        order_id: orderId,
        blank: notes[parsed.line_item_id] === "",
      },
    })
  } catch {
    // non-fatal
  }

  return res.json({ notes })
}

/**
 * DELETE /admin/orders/:id/proof-notes?line_item_id=<id>
 *   Removes the override so the PDF reverts to the customer's original notes.
 *   → { notes: { "<line>": string } }
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  if (!orderId) return res.status(400).json({ error: "id required" })

  const lineItemId =
    typeof req.query?.line_item_id === "string" ? req.query.line_item_id : ""
  if (!lineItemId) return res.status(400).json({ error: "line_item_id required" })

  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId)
  } catch {
    return res.status(404).json({ error: "Order not found" })
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const notes = readNotesMap(meta)
  delete notes[lineItemId]

  try {
    await orderModuleService.updateOrders(orderId, {
      metadata: { ...meta, [PROOF_NOTES_KEY]: notes },
    })
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: "Failed to reset notes", detail: String(err?.message ?? err) })
  }

  return res.json({ notes })
}
