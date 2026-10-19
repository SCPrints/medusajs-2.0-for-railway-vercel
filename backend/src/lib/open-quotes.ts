import type { MedusaContainer } from "@medusajs/framework/types"
import { QUOTE_MODULE } from "../modules/quote"

/**
 * Open quotes for a customer email, so staff emails can say "this customer
 * also has a quote in the pipeline". Mirrors `findOpenCarts` for carts.
 *
 * Born 2026-10-19: a POA embroidery quote and an order from the same
 * customer landed an hour apart as two unrelated emails; staff assumed the
 * order replaced the quote and it sat unanswered for three weeks.
 */

export type OpenQuoteSummary = {
  id: string
  public_id: string
  status: "new" | "quoted"
  subject: string | null
  created_at: string
}

const OPEN_STATUSES = ["new", "quoted"] as const

/** Pure: shape raw quote rows into summaries (newest first, capped). */
export const summarizeOpenQuotes = (
  rows: Array<Record<string, any>>,
  opts: { excludeQuoteId?: string | null; orderId?: string | null; limit?: number } = {}
): OpenQuoteSummary[] => {
  const limit = opts.limit ?? 5
  return rows
    .filter((q) => (OPEN_STATUSES as readonly string[]).includes(q.status))
    .filter((q) => !opts.excludeQuoteId || q.id !== opts.excludeQuoteId)
    .filter((q) => !opts.orderId || q.metadata?.order_id !== opts.orderId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((q) => ({
      id: q.id,
      public_id: q.public_id,
      status: q.status,
      subject: q.subject ?? null,
      created_at: new Date(q.created_at).toISOString(),
    }))
}

/** Pure: subject prefix for staff emails, "" when there are none. */
export const openQuoteSubjectTag = (quotes: OpenQuoteSummary[]): string => {
  if (!quotes.length) return ""
  return quotes.length === 1
    ? `[Open quote ${quotes[0].public_id}] `
    : `[${quotes.length} open quotes] `
}

export const findOpenQuotes = async (
  container: MedusaContainer,
  opts: { email: string; excludeQuoteId?: string | null; orderId?: string | null; limit?: number }
): Promise<OpenQuoteSummary[]> => {
  const email = opts.email.trim()
  if (!email) return []
  const quoteService = container.resolve(QUOTE_MODULE) as any
  // ponytail: exact-match filter on both spellings instead of ILIKE — quotes
  // are stored as typed, orders usually lowercased.
  const emails = Array.from(new Set([email, email.toLowerCase()]))
  const rows: Array<Record<string, any>> = await quoteService.listQuotes(
    { email: emails, status: [...OPEN_STATUSES] },
    { take: 20, order: { created_at: "DESC" } }
  )
  return summarizeOpenQuotes(rows, opts)
}
