"use server"

import { sdk } from "@lib/config"

export type QuoteApprovalState = {
  quote_id: string
  public_id: string | null
  company: string | null
  design_approval_status: "pending" | "approved" | "changes_requested"
  design_approved_at: string | null
  design_approver_name: string | null
  design_changes_comment: string | null
  /** Mockups designed in the Studio for this quote's lines. */
  mockup_urls: { side: string; side_label?: string | null; url: string }[]
}

export async function getQuoteApproval(
  quoteId: string,
  sig: string
): Promise<QuoteApprovalState | null> {
  try {
    return (await sdk.client.fetch("/store/quote-design-approval", {
      query: { quote: quoteId, sig },
    })) as QuoteApprovalState
  } catch {
    return null
  }
}

export async function submitQuoteDesignDecision(input: {
  quote: string
  sig: string
  approved: boolean
  approver_name?: string
  comment?: string
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    const res = (await sdk.client.fetch("/store/quote-design-approval", {
      method: "POST",
      body: input,
    })) as { ok: boolean; status: string }
    if (!res?.ok) {
      return { ok: false, error: "Server rejected the decision." }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Submit failed.",
    }
  }
}
