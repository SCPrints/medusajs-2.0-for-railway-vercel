import { createHash, randomBytes } from "node:crypto"

export const INVITE_TTL_DAYS = 14
export const MAX_PENDING_INVITES = 20
export const MAX_INVITE_SENDS = 3

export const ROLE_LABEL = { owner: "an owner", purchaser: "a purchaser", viewer: "a viewer" } as const

export const newInviteToken = (): { token: string; hash: string } => {
  const token = randomBytes(24).toString("base64url")
  return { token, hash: hashInviteToken(token) }
}
export const hashInviteToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export const inviteExpiry = (now = new Date()): Date => new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)

type InviteLike = { accepted_at?: Date | string | null; revoked_at?: Date | string | null; expires_at: Date | string }

export type InviteState = "pending" | "accepted" | "revoked" | "expired"
export function inviteState(i: InviteLike, now = new Date()): InviteState {
  if (i.accepted_at) return "accepted"
  if (i.revoked_at) return "revoked"
  return new Date(i.expires_at).getTime() < now.getTime() ? "expired" : "pending"
}

/** Can this account accept an invite sent to `inviteEmail`? */
export function acceptCheck(
  inviteEmail: string,
  account: { email?: string | null; verified: boolean }
): "ok" | "wrong_email" | "unverified" {
  if ((account.email ?? "").trim().toLowerCase() !== inviteEmail.trim().toLowerCase()) return "wrong_email"
  return account.verified ? "ok" : "unverified"
}

export const inviteUrl = (token: string): string | null => {
  const base = process.env.STOREFRONT_URL?.replace(/\/$/, "")
  if (!base) return null
  const cc = process.env.STOREFRONT_DEFAULT_COUNTRY_CODE
  return `${base}${cc ? `/${cc}` : ""}/account/organisations/invite/${token}`
}
