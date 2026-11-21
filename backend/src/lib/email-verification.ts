import { createHmac, timingSafeEqual } from "node:crypto"

import { NPS_LINK_SECRET } from "./constants"

/**
 * Sign-up email verification. An account is UNVERIFIED only while
 * `metadata.email_verification_required === true`; every older account has no
 * flag, so it counts as verified (no backfill). Only a verified account may be
 * matched to quotes / orders by email address.
 */
export const VERIFICATION_TTL_DAYS = 7
export const MAX_SENDS_PER_DAY = 3

type Meta = Record<string, unknown> | null | undefined

export const isEmailVerified = (customer: { metadata?: Meta } | null | undefined): boolean =>
  customer?.metadata?.email_verification_required !== true

/** Metadata after the customer confirms: flag cleared, time kept. */
export const markVerified = (metadata: Meta, now = new Date()): Record<string, unknown> => ({
  ...(metadata ?? {}),
  email_verification_required: false,
  email_verified_at: now.toISOString(),
})

/** At most MAX_SENDS_PER_DAY emails a day; returns the metadata to save, or null when over the limit. */
export function countSend(metadata: Meta, now = new Date()): Record<string, unknown> | null {
  const day = now.toISOString().slice(0, 10)
  const prev = (metadata?.email_verification_sends ?? {}) as { day?: string; n?: number }
  const n = prev.day === day ? Number(prev.n) || 0 : 0
  if (n >= MAX_SENDS_PER_DAY) return null
  return { ...(metadata ?? {}), email_verification_sends: { day, n: n + 1 } }
}

const sign = (email: string, exp: number): string =>
  createHmac("sha256", NPS_LINK_SECRET).update(`email-verify:${email}:${exp}`).digest("hex").slice(0, 32)

export function signEmailVerification(email: string, now = new Date()): { email: string; exp: number; sig: string } {
  const e = String(email).trim().toLowerCase()
  const exp = Math.floor(now.getTime() / 1000) + VERIFICATION_TTL_DAYS * 86400
  return { email: e, exp, sig: sign(e, exp) }
}

export function verifyEmailVerification(
  input: { email?: string; exp?: number | string; sig?: string },
  now = new Date()
): { ok: true; email: string } | { ok: false; reason: "bad_sig" | "expired" } {
  const email = String(input.email ?? "").trim().toLowerCase()
  const exp = Number(input.exp)
  const sig = String(input.sig ?? "")
  const expected = sign(email, exp)
  if (!email || !Number.isFinite(exp) || sig.length !== expected.length) return { ok: false, reason: "bad_sig" }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return { ok: false, reason: "bad_sig" }
  if (exp * 1000 < now.getTime()) return { ok: false, reason: "expired" }
  return { ok: true, email }
}

/** Storefront link the email carries. Null when STOREFRONT_URL is not set. */
export function verificationUrl(email: string, now = new Date()): string | null {
  const base = process.env.STOREFRONT_URL?.replace(/\/$/, "")
  if (!base) return null
  const { exp, sig, email: e } = signEmailVerification(email, now)
  const cc = process.env.STOREFRONT_DEFAULT_COUNTRY_CODE
  return `${base}${cc ? `/${cc}` : ""}/verify-email?email=${encodeURIComponent(e)}&exp=${exp}&sig=${sig}`
}
