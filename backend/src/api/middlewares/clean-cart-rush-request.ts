import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/** Cleans a rush request into { tier, needed_by? } (or null), so cart and order never hold junk. */
export function cleanRushRequest(raw: unknown): { tier: "priority" | "express"; needed_by?: string } | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.tier !== "priority" && r.tier !== "express") return null
  const out: { tier: "priority" | "express"; needed_by?: string } = { tier: r.tier }
  if (typeof r.needed_by === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.needed_by.slice(0, 10))) {
    out.needed_by = r.needed_by.slice(0, 10)
  }
  return out
}

/**
 * POST /store/carts/:id may carry `metadata.rush_request` ("Need it sooner?").
 * Keep only { tier, needed_by }; anything else becomes "", which Medusa's
 * metadata merge treats as "remove the key". Copies onto the order at completion
 * with the rest of cart metadata, like po_number.
 */
export function cleanCartRushRequestMiddleware(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): void {
  for (const body of [req.body, (req as { validatedBody?: unknown }).validatedBody]) {
    const meta = (body as { metadata?: unknown } | undefined)?.metadata
    if (!meta || typeof meta !== "object" || !("rush_request" in meta)) continue
    const m = meta as Record<string, unknown>
    m.rush_request = cleanRushRequest(m.rush_request) ?? ""
  }
  next()
}
