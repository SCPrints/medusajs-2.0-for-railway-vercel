import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { getPostHog } from "../../../../../lib/posthog"

/**
 * Per-side "studio note" shown to the customer UNDER that side's mockup on the
 * artwork-approval page (`/[country]/artwork-approval/[orderId]`). Distinct from
 * the customer's own `customizerDesign.printNotes` (which the customer typed in
 * the Studio and which surfaces in the Mockup PDF). This is a staff-authored
 * placement / colour note that travels with the mockup at approval time.
 *
 * Stored as a flat map on the order so it's independent of whether a revised
 * proof exists for the side:
 *   order.metadata.mockup_studio_notes = { "<line_item_id>:<side>": "note text" }
 *
 * The store artwork-approval GET reads this map and attaches each note to the
 * matching `mockup_urls[]` entry; the keys match `buildLineCustomizerExport`
 * artifact sides, so admin-write and store-read agree without extra plumbing.
 */

const STUDIO_NOTES_KEY = "mockup_studio_notes"

const upsertSchema = z.object({
  line_item_id: z.string().min(1),
  side: z.string().min(1),
  // Empty string clears the note for that side.
  note: z.string().max(500),
})

function noteKey(lineItemId: string, side: string) {
  return `${lineItemId}:${side}`
}

function readNotesMap(meta: Record<string, unknown>): Record<string, string> {
  const raw = meta[STUDIO_NOTES_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v
  }
  return out
}

/** GET /admin/orders/:id/mockup-note → { notes: { "<line>:<side>": string } } */
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
 * POST /admin/orders/:id/mockup-note
 *   body { line_item_id, side, note }  — upsert; empty `note` deletes the entry.
 *   → { notes: { "<line>:<side>": string } }
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
  // we must spread the existing keys (revised_proofs, deposit_notes, …) back in.
  const notes = readNotesMap(meta)
  const key = noteKey(parsed.line_item_id, parsed.side)
  const trimmed = parsed.note.trim()
  if (trimmed) {
    notes[key] = trimmed
  } else {
    delete notes[key]
  }

  try {
    await orderModuleService.updateOrders(orderId, {
      metadata: { ...meta, [STUDIO_NOTES_KEY]: notes },
    })
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: "Failed to save note", detail: String(err?.message ?? err) })
  }

  try {
    getPostHog()?.capture({
      distinctId: (req as any).auth_context?.actor_id ?? "admin",
      event: "mockup_studio_note_saved",
      properties: {
        order_id: orderId,
        side: parsed.side,
        cleared: !trimmed,
      },
    })
  } catch {
    // non-fatal
  }

  return res.json({ notes })
}
