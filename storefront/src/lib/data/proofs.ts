"use server"

import { sdk } from "@lib/config"

import type { ArtworkApprovalState } from "./artwork-approval"
import { getAuthHeaders } from "./cookies"
import type { ProofPin } from "@modules/artwork-approval/lib/pins"

export type MyProof = ArtworkApprovalState & {
  /** True while the proof is out for the customer's answer. */
  waiting: boolean
  change_pins: ProofPin[]
}

const base = (orderId: string) => `/store/customers/me/orders/${encodeURIComponent(orderId)}`

// Per-customer data, deliberately uncached. null = not theirs / nothing to show.
export async function getMyProof(orderId: string): Promise<MyProof | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch(`${base(orderId)}/proof`, {
      headers,
      cache: "no-store",
    })) as MyProof
  } catch {
    return null
  }
}

export async function decideMyProof(
  orderId: string,
  input: { approved: boolean; approver_name?: string; comment?: string; pins?: ProofPin[] }
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in again." }
  try {
    const res = (await sdk.client.fetch(`${base(orderId)}/proof`, {
      method: "POST",
      headers,
      body: input,
    })) as { ok?: boolean; status?: string }
    if (!res?.ok || !res.status) return { ok: false, error: "We couldn't save that. Please try again." }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "We couldn't save that. Please try again." }
  }
}

/** The signed approval link, for passing to someone else. Nothing is emailed. */
export async function getMyApprovalLink(orderId: string): Promise<string | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(`${base(orderId)}/approval-link`, {
      method: "POST",
      headers,
    })) as { url?: string }
    return res.url ?? null
  } catch {
    return null
  }
}
