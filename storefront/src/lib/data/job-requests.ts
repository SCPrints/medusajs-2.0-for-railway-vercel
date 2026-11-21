"use server"

import { sdk } from "@lib/config"

import { getAuthHeaders } from "./cookies"

export type ThreadMessage = { id: string; at: string; from: "you" | "staff"; text: string }
export type RequestStatus = "open" | "approved" | "declined" | "resolved"
export type CustomerRequest = {
  id: string
  kind: "problem" | "size_swap"
  status: RequestStatus
  staff_note: string | null
  created_at: string
  problem?: string
  details?: string | null
  photo_urls?: string[]
  from_size?: string
  to_size?: string
  quantity?: number
}
export type RequestLine = { id: string; title: string; variant_title: string | null; quantity: number }
export type Result = { ok: true } | { ok: false; error: string }

const base = (orderId: string) => `/store/customers/me/orders/${encodeURIComponent(orderId)}`
const fail = (err: unknown): { ok: false; error: string } => ({
  ok: false,
  error: err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.",
})

// Per-customer data, deliberately uncached. null = signed out / not their order.
export async function getOrderMessages(orderId: string): Promise<ThreadMessage[] | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(`${base(orderId)}/messages`, { headers })) as { messages?: ThreadMessage[] }
    return res.messages ?? []
  } catch {
    return null
  }
}

export async function getOrderRequests(orderId: string): Promise<{ requests: CustomerRequest[]; lines: RequestLine[] } | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(`${base(orderId)}/requests`, { headers })) as { requests?: CustomerRequest[]; lines?: RequestLine[] }
    return { requests: res.requests ?? [], lines: res.lines ?? [] }
  } catch {
    return null
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<Result> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    await sdk.client.fetch(path, { method: "POST", headers, body })
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export const sendOrderMessage = (orderId: string, text: string) => post(`${base(orderId)}/messages`, { text })

export const reportOrderProblem = (
  orderId: string,
  body: { what: string; details: string; line_item_ids: string[]; photo_urls: string[] }
) => post(`${base(orderId)}/problems`, body)

export const requestSizeSwap = (
  orderId: string,
  body: { line_item_id: string; from_size: string; to_size: string; quantity: number; note?: string }
) => post(`${base(orderId)}/size-swaps`, body)
