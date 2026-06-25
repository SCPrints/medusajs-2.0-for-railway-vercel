import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { getPostHog } from "../../../../../lib/posthog"

/**
 * Per-side editable PRINT DIMENSION shown UNDER that side's mockup on the
 * artwork-approval flow (Mockup PDF + customer web approval page).
 *
 * Why this exists: the dimensions the Mockup PDF used to print came from the
 * customizer's order-time print-size *band* (`customizerDesign.prints[].sizeId`
 * → fixed "21×30 cm" / "29×42 cm" labels). That's the coarse pricing tier the
 * customer selected in the Studio, NOT the real artwork size, and it's frozen
 * at order placement — so it can't reflect a spec the customer revised AFTER
 * ordering (e.g. "front logo 8.75×3.5cm"). This free-text override lets staff
 * type the real per-side dimension during artwork review; the PDF and the
 * customer approval page both prefer it over the band.
 *
 * Stored as a flat map on the order so it's independent of revised proofs:
 *   order.metadata.mockup_print_dimensions = { "<line_item_id>:<side>": "8.75×3.5cm" }
 *
 * Keys match `buildLineCustomizerExport` artifact sides (same convention as the
 * sibling `mockup_studio_notes` map), so admin-write and PDF/store-read agree
 * without extra plumbing.
 */

const DIMENSIONS_KEY = "mockup_print_dimensions"

const upsertSchema = z.object({
  line_item_id: z.string().min(1),
  side: z.string().min(1),
  // Empty string clears the dimension for that side.
  dimension: z.string().max(100),
})

function dimensionKey(lineItemId: string, side: string) {
  return `${lineItemId}:${side}`
}

function readDimensionsMap(meta: Record<string, unknown>): Record<string, string> {
  const raw = meta[DIMENSIONS_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v
  }
  return out
}

/** GET /admin/orders/:id/print-dimension → { dimensions: { "<line>:<side>": string } } */
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
  return res.json({ dimensions: readDimensionsMap(meta) })
}

/**
 * POST /admin/orders/:id/print-dimension
 *   body { line_item_id, side, dimension }  — upsert; empty `dimension` deletes the entry.
 *   → { dimensions: { "<line>:<side>": string } }
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
  // we must spread the existing keys (revised_proofs, mockup_studio_notes, …)
  // back in.
  const dimensions = readDimensionsMap(meta)
  const key = dimensionKey(parsed.line_item_id, parsed.side)
  const trimmed = parsed.dimension.trim()
  if (trimmed) {
    dimensions[key] = trimmed
  } else {
    delete dimensions[key]
  }

  try {
    await orderModuleService.updateOrders(orderId, {
      metadata: { ...meta, [DIMENSIONS_KEY]: dimensions },
    })
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: "Failed to save dimension", detail: String(err?.message ?? err) })
  }

  try {
    getPostHog()?.capture({
      distinctId: (req as any).auth_context?.actor_id ?? "admin",
      event: "mockup_print_dimension_saved",
      properties: {
        order_id: orderId,
        side: parsed.side,
        cleared: !trimmed,
      },
    })
  } catch {
    // non-fatal
  }

  return res.json({ dimensions })
}
