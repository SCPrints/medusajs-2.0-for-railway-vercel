"use server"

import { sdk } from "@lib/config"
import { updateTag } from "next/cache"

import { transferGuestCartToCustomer } from "./cart"
import { getAuthHeaders, setAuthToken } from "./cookies"

// Sign-up email confirmation, two-step login and colleague invitations.
// Per-customer data, deliberately uncached; every call sends the customer's token.

type Result = { ok: true } | { ok: false; error: string }
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error && e.message && e.message.length < 200 ? e.message : fallback,
})

// ── Email confirmation ───────────────────────────────────────────────────────

/** Null when signed out. */
export async function getEmailStatus(): Promise<{ verified: boolean; email: string | null } | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch("/store/customers/me/verify-email", { headers })) as { verified: boolean; email: string | null }
  } catch {
    return null
  }
}

export async function resendEmailConfirmation(): Promise<Result> {
  try {
    await sdk.client.fetch("/store/customers/me/verify-email/resend", { method: "POST", headers: await getAuthHeaders() })
    return { ok: true }
  } catch (e) {
    return fail(e, "We couldn't send that. Try again soon.")
  }
}

export async function confirmEmail(p: { email: string; exp: string; sig: string }): Promise<"confirmed" | "expired" | "invalid"> {
  try {
    await sdk.client.fetch("/store/customers/verify-email", { method: "POST", body: p })
    updateTag("customer")
    return "confirmed"
  } catch (e: any) {
    return String(e?.message ?? "").includes("expired") ? "expired" : e?.status === 400 ? "invalid" : "invalid"
  }
}

// ── Two-step login (authenticator app, Medusa's own MFA) ─────────────────────

export async function getTwoStep(): Promise<{ enabled: boolean; factorId: string | null }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { enabled: false, factorId: null }
  try {
    const { mfa_factors } = await sdk.auth.mfa.list(headers)
    const on = (mfa_factors ?? []).find((f: any) => f.provider === "totp" && f.status === "enabled")
    return { enabled: !!on, factorId: on?.id ?? null }
  } catch {
    return { enabled: false, factorId: null }
  }
}

export async function startTwoStep(email: string): Promise<{ ok: true; factorId: string; secret: string; url: string } | { ok: false; error: string }> {
  try {
    const r: any = await sdk.auth.mfa.start({ provider: "totp", label: email, issuer: "SC Prints" }, await getAuthHeaders())
    return { ok: true, factorId: r.mfa_factor.id, secret: r.secret, url: r.otpauth_url }
  } catch (e) {
    return fail(e, "Two-step login isn't available right now.")
  }
}

/** Confirms the first code, switches it on, and returns one-time backup codes. */
export async function confirmTwoStep(factorId: string, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders()
    await sdk.auth.mfa.verify(factorId, { code: code.trim() }, headers)
    const { recovery_codes } = await sdk.auth.mfa.generateRecoveryCodes({}, headers)
    return { ok: true, recoveryCodes: recovery_codes ?? [] }
  } catch (e) {
    return fail(e, "That code didn't work. Check the app and try again.")
  }
}

export async function turnOffTwoStep(factorId: string): Promise<Result> {
  try {
    await sdk.auth.mfa.disable(factorId, {}, await getAuthHeaders())
    return { ok: true }
  } catch (e) {
    return fail(e, "We couldn't turn that off. Try again.")
  }
}

/** Second step of sign-in: the code from the app (or a backup code). */
export async function completeTwoStepLogin(p: { challengeId: string; token: string; code: string; method: "totp" | "recovery_code" }): Promise<Result> {
  try {
    const token = await sdk.auth.mfa.verifyChallenge(p.challengeId, { method: p.method, code: p.code.trim() }, { authorization: `Bearer ${p.token}` })
    await setAuthToken(token)
    updateTag("customer")
    await transferGuestCartToCustomer({ authorization: `Bearer ${token}` })
    return { ok: true }
  } catch (e) {
    return fail(e, "That code didn't work. Try again.")
  }
}

// ── Colleague invitations ────────────────────────────────────────────────────

export type OrgInvite = { id: string; email: string; role: "owner" | "purchaser" | "viewer"; expires_at: string; send_count: number }
export type InvitePreview = { organisation: { name: string }; email: string; role: string; role_label: string; problem: null | "wrong_email" | "unverified" }

const orgBase = (orgId: string) => `/store/customers/me/organisations/${encodeURIComponent(orgId)}/invites`

export async function listOrgInvites(orgId: string): Promise<OrgInvite[]> {
  try {
    const r = (await sdk.client.fetch(orgBase(orgId), { headers: await getAuthHeaders() })) as { invites: OrgInvite[] }
    return r.invites ?? []
  } catch {
    return []
  }
}

export async function inviteColleague(orgId: string, email: string, role: OrgInvite["role"]): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  try {
    const r = (await sdk.client.fetch(orgBase(orgId), { method: "POST", body: { email, role }, headers: await getAuthHeaders() })) as { sent: boolean }
    return { ok: true, sent: r.sent }
  } catch (e) {
    return fail(e, "We couldn't send that invitation.")
  }
}

export async function resendOrgInvite(orgId: string, inviteId: string): Promise<Result> {
  try {
    await sdk.client.fetch(`${orgBase(orgId)}/${encodeURIComponent(inviteId)}/resend`, { method: "POST", headers: await getAuthHeaders() })
    return { ok: true }
  } catch (e) {
    return fail(e, "We couldn't resend that invitation.")
  }
}

export async function cancelOrgInvite(orgId: string, inviteId: string): Promise<Result> {
  try {
    await sdk.client.fetch(`${orgBase(orgId)}/${encodeURIComponent(inviteId)}`, { method: "DELETE", headers: await getAuthHeaders() })
    return { ok: true }
  } catch (e) {
    return fail(e, "We couldn't cancel that invitation.")
  }
}

/** Null for a link that is unknown, used, cancelled or old. */
export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch(`/store/customers/me/organisation-invites/${encodeURIComponent(token)}`, { headers })) as InvitePreview
  } catch {
    return null
  }
}

export async function acceptOrgInvite(token: string): Promise<Result> {
  try {
    await sdk.client.fetch(`/store/customers/me/organisation-invites/${encodeURIComponent(token)}/accept`, { method: "POST", headers: await getAuthHeaders() })
    updateTag("customer")
    return { ok: true }
  } catch (e) {
    return fail(e, "We couldn't accept that invitation.")
  }
}
