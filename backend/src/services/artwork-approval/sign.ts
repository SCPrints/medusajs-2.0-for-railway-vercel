import { createHmac, timingSafeEqual } from "node:crypto"

import { LINK_SIGNING_SECRET_INSECURE, NPS_LINK_SECRET } from "../../lib/constants"

/**
 * HMAC-signed artwork approval URLs. Re-uses NPS_LINK_SECRET as the
 * key — same trust model, same operational requirements (must be set
 * in prod; placeholder in dev). Keeping a single secret avoids
 * config sprawl.
 */
export function signArtworkApproval(orderId: string): string {
  const h = createHmac("sha256", NPS_LINK_SECRET)
  h.update(`artwork:${orderId}`)
  return h.digest("hex").slice(0, 24)
}

export function verifyArtworkApproval(
  orderId: string,
  signature: string
): boolean {
  // Fail closed if the signing secret is the forgeable dev placeholder in prod.
  if (LINK_SIGNING_SECRET_INSECURE) return false
  if (!orderId || !signature || typeof signature !== "string") return false
  const expected = signArtworkApproval(orderId)
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
