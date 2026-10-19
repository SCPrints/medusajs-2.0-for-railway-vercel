import { createHmac, timingSafeEqual } from "node:crypto"

import { LINK_SIGNING_SECRET_INSECURE, NPS_LINK_SECRET } from "../../lib/constants"

/**
 * HMAC-signed artwork approval URLs. Re-uses NPS_LINK_SECRET as the
 * key — same trust model, same operational requirements (must be set
 * in prod; placeholder in dev). Keeping a single secret avoids
 * config sprawl.
 *
 * The signed message is `artwork:${orderId}:${round}` where `round` is
 * `metadata.artwork_stage_changed_at` — stamped by every writer when the
 * artwork track moves, so it changes whenever a revised proof is sent. A
 * link minted for round N stops verifying the moment round N+1 exists, and
 * a link forwarded months later approves nothing (review 3-3). Links minted
 * before this landed (message without the round) no longer verify.
 */
export function signArtworkApproval(orderId: string, round: string): string {
  const h = createHmac("sha256", NPS_LINK_SECRET)
  h.update(`artwork:${orderId}:${round}`)
  return h.digest("hex").slice(0, 24)
}

/** The proof round token for an order, or null when the artwork track has never moved. */
export function artworkProofRound(
  meta: Record<string, unknown> | null | undefined
): string | null {
  const v = meta?.artwork_stage_changed_at
  return typeof v === "string" && v.length > 0 ? v : null
}

export function verifyArtworkApproval(
  orderId: string,
  round: string | null | undefined,
  signature: string
): boolean {
  // Fail closed if the signing secret is the forgeable dev placeholder in prod.
  if (LINK_SIGNING_SECRET_INSECURE) return false
  if (!orderId || !round || !signature || typeof signature !== "string") return false
  const expected = signArtworkApproval(orderId, round)
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
