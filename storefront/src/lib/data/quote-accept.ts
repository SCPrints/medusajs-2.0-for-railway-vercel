"use server"

import { sdk } from "@lib/config"

/** Technique + size per decoration (built by backend lib/quote-decorations.ts). */
export type QuoteDecoration = {
  garment: string | null
  side: string
  side_label: string
  method: string
  detail: string
}

export type QuoteJobBreakdown = {
  summary: string | null
  garment_quantity: number
  designs: Array<{ label: string; image_url: string | null }>
  groups: Array<{
    title: string
    thumbnail: string | null
    quantity: number
    unit_min: number
    unit_max: number
    total: number
    positions: string[]
    rows: Array<{ label: string; quantity: number; unit: number; total: number }>
  }>
  extras: Array<{ label: string; quantity: number; unit: number; total: number; waived: boolean }>
  totals: { subtotal: number; discount: number; total: number }
}

export type QuoteForAccept = {
  public_id: string
  status: string
  subject: string | null
  contact_name: string | null
  company: string | null
  message: string | null
  currency_code: string
  total_estimate: number | string | null
  line_items: Array<{
    title?: string
    description?: string | null
    quantity?: number | null
    unit_price?: number | null
    total?: number | null
    variant_id?: string
    /** Mockup (or product) image so the customer sees what they're accepting. */
    thumbnail?: string | null
  }>
  /** All Studio mockups across the quote (every print position) for the preview. */
  mockups?: Array<{
    side: string
    side_label?: string | null
    url: string
  }>
  decorations?: QuoteDecoration[]
  /** Job-pricer breakdown (backend lib/quote-job-breakdown.ts) — null unless priced in the Job pricer. */
  job_breakdown?: QuoteJobBreakdown | null
  expires_at: string | null
  already_accepted?: boolean
}

export async function getQuoteForAccept(
  id: string,
  sig: string
): Promise<QuoteForAccept | null> {
  try {
    return (await sdk.client.fetch(
      `/store/quotes/${encodeURIComponent(id)}?sig=${encodeURIComponent(sig)}`
    )) as QuoteForAccept
  } catch {
    return null
  }
}

export async function acceptQuote(input: {
  id: string
  sig: string
  approver_name?: string
}): Promise<
  | {
      ok: true
      cart_id: string
      lines_added: number
      skipped_items: unknown[]
    }
  | { ok: false; error: string }
> {
  try {
    const res = (await sdk.client.fetch(
      `/store/quotes/${encodeURIComponent(input.id)}/accept`,
      {
        method: "POST",
        body: { sig: input.sig, approver_name: input.approver_name },
      }
    )) as {
      ok: boolean
      cart_id: string
      lines_added: number
      skipped_items: unknown[]
    }
    if (!res?.ok || !res.cart_id) {
      return { ok: false, error: "Couldn't accept quote." }
    }
    return res as any
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to accept quote.",
    }
  }
}
