import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

import { LINK_SIGNING_SECRET_INSECURE, NPS_LINK_SECRET } from "../../lib/constants"

/**
 * Team-store capability tokens, signed with NPS_LINK_SECRET like the quote
 * links. Distinct prefixes so a Studio design token (`team-store-design:`,
 * keyed on the ITEM id) can't be replayed as an organiser approval
 * (`team-store-approve:`, keyed on the STORE id) or as a quote token.
 */
type Kind = "design" | "approve"

export function signTeamStore(kind: Kind, id: string): string {
  return createHmac("sha256", NPS_LINK_SECRET).update(`team-store-${kind}:${id}`).digest("hex").slice(0, 24)
}

export function verifyTeamStore(kind: Kind, id: string, signature: unknown): boolean {
  if (LINK_SIGNING_SECRET_INSECURE) return false
  if (!id || typeof signature !== "string" || !signature) return false
  const expected = signTeamStore(kind, id)
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

/** Optional store password (Decision 8). `scrypt$<salt>$<hash>`. */
export function hashStorePassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`
}

export function verifyStorePassword(hash: string | null | undefined, password: unknown): boolean {
  if (!hash) return true
  if (typeof password !== "string" || !password) return false
  const [scheme, salt, digest] = hash.split("$")
  if (scheme !== "scrypt" || !salt || !digest) return false
  const actual = scryptSync(password, salt, 32)
  const expected = Buffer.from(digest, "hex")
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
