"use server"

import { MEDUSA_BACKEND_URL } from "@lib/config"
import { cookies } from "next/headers"

/**
 * Team stores (Docs/TEAM_STORES_SPEC.md). Never cached: the store's state
 * (open / closed), its password and its prices change under the buyer, and
 * the pages are noindex with club-newsletter traffic only.
 */

export type TeamStoreItem = {
  id: string
  title: string
  product_handle: string
  colour: string
  unit_price: number
  thumbnail: string | null
  mockups: string[]
  sizes: Array<{ variant_id: string; size: string }>
}

export type TeamStoreView = {
  store: {
    id: string
    handle: string
    title: string
    intro: string | null
    banner_url: string | null
    accent_colour: string | null
    opens_at: string | null
    closes_at: string
    status: string
    state: "open" | "not_yet_open" | "closed"
    delivery_mode: "bulk" | "individual"
    organisation_name: string | null
    approved_at: string | null
    approved_by_name: string | null
    /** Dollars per item raised for the organisation, already inside each unit_price. */
    fundraising_per_item?: number
  }
  items: TeamStoreItem[]
}

export type TeamStoreResult =
  | { kind: "ok"; view: TeamStoreView }
  | { kind: "password"; title: string; wrong: boolean }
  | { kind: "missing" }

const cookieName = (handle: string) => `scp_tstore_${handle.replace(/[^a-z0-9-]/gi, "")}`

async function backend(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers ?? {}) }
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()
  if (key) headers["x-publishable-api-key"] = key
  const res = await fetch(`${MEDUSA_BACKEND_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, json: json as any }
}

async function storePassword(handle: string): Promise<string | undefined> {
  return (await cookies()).get(cookieName(handle))?.value
}

export async function getTeamStore(handle: string): Promise<TeamStoreResult> {
  const password = await storePassword(handle)
  const r = await backend(`/store/team-stores/${encodeURIComponent(handle)}`, {
    headers: password ? { "x-team-store-password": password } : {},
  })
  if (r.status === 401) return { kind: "password", title: r.json?.title ?? "Team store", wrong: !!r.json?.wrong }
  if (!r.ok) return { kind: "missing" }
  return { kind: "ok", view: r.json as TeamStoreView }
}

/** Checks the password against the backend, then remembers it for 30 days. */
export async function unlockTeamStore(handle: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const r = await backend(`/store/team-stores/${encodeURIComponent(handle)}`, {
    headers: { "x-team-store-password": password },
  })
  if (r.status === 401) return { ok: false, error: "That password isn't right." }
  if (!r.ok) return { ok: false, error: "This store isn't available." }
  ;(await cookies()).set(cookieName(handle), password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })
  return { ok: true }
}

/** The stored password, for the cart route (which checks it again). */
export async function getTeamStorePassword(handle: string): Promise<string | undefined> {
  return storePassword(handle)
}

export async function getTeamStoreApproval(
  handle: string,
  sig: string
): Promise<(TeamStoreView & { can_approve: boolean }) | null> {
  const r = await backend(`/store/team-stores/${encodeURIComponent(handle)}/approve?sig=${encodeURIComponent(sig)}`)
  return r.ok ? (r.json as TeamStoreView & { can_approve: boolean }) : null
}

export async function approveTeamStore(handle: string, sig: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const r = await backend(`/store/team-stores/${encodeURIComponent(handle)}/approve`, {
    method: "POST",
    body: { sig, name },
  })
  return r.ok ? { ok: true } : { ok: false, error: r.json?.message ?? "Couldn't approve right now." }
}
