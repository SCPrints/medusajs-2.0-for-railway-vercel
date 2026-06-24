import { createHmac, timingSafeEqual } from "node:crypto"

import { LINK_SIGNING_SECRET_INSECURE, NPS_LINK_SECRET } from "../../lib/constants"

/**
 * HMAC-signed "Design in Studio" capability tokens for quotes. Re-uses
 * NPS_LINK_SECRET — same trust model as the quote-accept, artwork-approval,
 * and NPS links.
 *
 * Distinct message prefix from quote-accept (`quote-design:` vs `quote:`) so an
 * accept signature can never be replayed as a design-edit token, and vice
 * versa.
 *
 * Unlike POS — where the short-TTL session id IS the capability — a quote id is
 * long-lived, so the storefront → backend design post-back must carry this
 * signature to authorise appending lines to the quote.
 */
export function signQuoteDesign(quoteId: string): string {
  const h = createHmac("sha256", NPS_LINK_SECRET)
  h.update(`quote-design:${quoteId}`)
  return h.digest("hex").slice(0, 24)
}

export function verifyQuoteDesign(quoteId: string, signature: string): boolean {
  // Fail closed if the signing secret is the forgeable dev placeholder in prod.
  if (LINK_SIGNING_SECRET_INSECURE) return false
  if (!quoteId || typeof signature !== "string" || signature.length === 0) {
    return false
  }
  const expected = signQuoteDesign(quoteId)
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
