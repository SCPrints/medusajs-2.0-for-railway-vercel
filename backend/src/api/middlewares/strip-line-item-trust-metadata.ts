import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { stripServerTrustMetadata } from "../../lib/client-line-metadata"

/**
 * Medusa's core POST /store/carts/:id/line-items and
 * POST /store/carts/:id/line-items/:line_id accept arbitrary `metadata`, and
 * the handlers read `req.validatedBody`. Delete the server-trust keys from
 * both the raw and the validated body so the ordering of this middleware
 * against `validateAndTransformBody` doesn't matter (review 1-4 / 1-5).
 */
export function stripLineItemTrustMetadataMiddleware(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): void {
  for (const body of [req.body, (req as { validatedBody?: unknown }).validatedBody]) {
    if (!body || typeof body !== "object") continue
    const b = body as Record<string, unknown>
    if ("metadata" in b) b.metadata = stripServerTrustMetadata(b.metadata)
  }
  next()
}
