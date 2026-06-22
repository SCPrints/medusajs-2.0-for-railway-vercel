import { createHmac, timingSafeEqual } from "node:crypto"

import { LINK_SIGNING_SECRET_INSECURE, NPS_LINK_SECRET } from "../../lib/constants"

/**
 * HMAC-signed capability tokens for the customer-facing QUOTE DESIGN APPROVAL
 * link. Re-uses NPS_LINK_SECRET — same trust model as quote-accept,
 * quote-design, artwork-approval, and NPS links.
 *
 * Distinct message prefix (`quote-approval:`) from the other quote tokens
 * (`quote:` accept, `quote-design:` design-edit) so a token minted for one
 * purpose can never be replayed for another.
 */
export function signQuoteApproval(quoteId: string): string {
  const h = createHmac("sha256", NPS_LINK_SECRET)
  h.update(`quote-approval:${quoteId}`)
  return h.digest("hex").slice(0, 24)
}

export function verifyQuoteApproval(quoteId: string, signature: string): boolean {
  // Fail closed if the signing secret is the forgeable dev placeholder in prod.
  if (LINK_SIGNING_SECRET_INSECURE) return false
  if (!quoteId || typeof signature !== "string" || signature.length === 0) {
    return false
  }
  const expected = signQuoteApproval(quoteId)
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
