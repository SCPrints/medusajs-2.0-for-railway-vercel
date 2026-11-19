"use server"

import { sdk } from "@lib/config"
import { redirect } from "next/navigation"

import { getAuthHeaders } from "./cookies"
import type { QuoteDecoration, QuoteJobBreakdown } from "./quote-accept"

/** "cart" = a quote the customer downloaded from their cart and has not asked us about. */
export type AccountQuoteStatus = "cart" | "waiting" | "ready" | "accepted" | "expired" | "closed"

export type AccountQuoteLine = {
  title: string
  description: string | null
  sizes: string | null
  quantity: number
  unit_price: number | null
  unit_price_max: number | null
  total: number | null
  thumbnail: string | null
}

export type AccountQuote = {
  id: string
  public_id: string
  status: AccountQuoteStatus
  status_label: string
  subject: string | null
  created_at: string | null
  quoted_at: string | null
  expires_at: string | null
  currency_code: string
  /** inc GST; null until we have sent the quote */
  total: number | null
  lines: AccountQuoteLine[]
  can_accept: boolean
  order: { id: string; display_id: string | null; in_account?: boolean } | null
}

export type AccountQuoteDetail = AccountQuote & {
  contact_name: string | null
  company: string | null
  mockups: Array<{ label: string | null; url: string }>
  decorations: QuoteDecoration[]
  job_breakdown: QuoteJobBreakdown | null
  pay_url: string | null
}

const BASE = "/store/customers/me/quotes"

// Per-customer data, deliberately uncached (same as designs / artwork).
export async function listMyQuotes(): Promise<AccountQuote[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  try {
    const res = (await sdk.client.fetch(BASE, { headers })) as { quotes?: AccountQuote[] }
    return res.quotes ?? []
  } catch {
    return []
  }
}

export async function getMyQuote(id: string): Promise<AccountQuoteDetail | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(`${BASE}/${encodeURIComponent(id)}`, { headers })) as {
      quote?: AccountQuoteDetail
    }
    return res.quote ?? null
  } catch {
    return null
  }
}

/**
 * "Accept quote": asks the backend for the signed accept link (made there, for
 * the quote's owner only) and opens the normal accept page, where the customer
 * confirms delivery details and accepts.
 */
export async function acceptMyQuote(countryCode: string, id: string): Promise<void> {
  const headers = await getAuthHeaders()
  let path: string | null = null
  try {
    const res = (await sdk.client.fetch(`${BASE}/${encodeURIComponent(id)}/accept-link`, {
      method: "POST",
      headers,
    })) as { path?: string }
    path = typeof res.path === "string" && res.path.startsWith("/quote-accept/") ? res.path : null
  } catch {
    path = null
  }
  // redirect() throws, so it stays outside the try.
  redirect(path ? `/${countryCode}${path}` : `/${countryCode}/account/quotes/${encodeURIComponent(id)}?accept=failed`)
}
