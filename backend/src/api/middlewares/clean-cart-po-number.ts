import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { cleanPoNumber } from "../../lib/po-number"

/**
 * POST /store/carts/:id may carry `metadata.po_number` (checkout's PO field).
 * Trim + cap it at 60 here so the cart, and the order that copies cart
 * metadata at completion, never hold a raw value. A blank becomes "", which
 * Medusa's metadata merge treats as "remove the key".
 */
export function cleanCartPoNumberMiddleware(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): void {
  for (const body of [req.body, (req as { validatedBody?: unknown }).validatedBody]) {
    const meta = (body as { metadata?: unknown } | undefined)?.metadata
    if (!meta || typeof meta !== "object" || !("po_number" in meta)) continue
    const m = meta as Record<string, unknown>
    m.po_number = cleanPoNumber(m.po_number) ?? ""
  }
  // The PO document is set only by /store/carts/:id/po-document (our bucket).
  for (const body of [req.body, (req as { validatedBody?: unknown }).validatedBody]) {
    const meta = (body as { metadata?: unknown } | undefined)?.metadata
    if (meta && typeof meta === "object") delete (meta as Record<string, unknown>).po_document
  }
  next()
}
