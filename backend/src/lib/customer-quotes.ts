/**
 * What a signed-in customer may see of their own quotes (/account/quotes).
 * Pure — unit-tested. Never returns staff fields: assignee, events, the
 * enquiry message, quote metadata (Job-pricer costs / margins), or the
 * Studio design payload.
 */
import { isQuoteExpired } from "../services/quote/expire"

export type CustomerQuoteStatus = "cart" | "waiting" | "ready" | "accepted" | "expired" | "closed"

const STATUS_LABEL: Record<CustomerQuoteStatus, string> = {
  cart: "From your cart",
  waiting: "Waiting on us",
  ready: "Ready to accept",
  accepted: "Accepted",
  expired: "Expired",
  closed: "Closed",
}

export function customerQuoteStatus(
  quote: { status?: string | null; expires_at?: Date | string | null; metadata?: Record<string, any> | null },
  now: Date = new Date()
): { key: CustomerQuoteStatus; label: string } {
  const s = String(quote.status ?? "new")
  const cartPdf = cartPdfOf(quote)
  const key: CustomerQuoteStatus =
    s === "accepted" || s === "converting" || s === "converted"
      ? "accepted"
      : s === "lost"
      ? "closed"
      : s === "expired"
      ? "expired"
      : s === "quoted"
      ? // The expiry cron is off by default, so the date decides (same rule as the accept route).
        isQuoteExpired(quote.expires_at, now)
        ? "expired"
        : "ready"
      : // A quote the customer downloaded from their cart and never asked us about:
        // nobody here is working on it, so "Waiting on us" would be a lie.
        cartPdf && quote.metadata?.staff_notified === false
        ? isQuoteExpired(cartPdf.valid_until, now)
          ? "expired"
          : "cart"
        : "waiting"
  return { key, label: STATUS_LABEL[key] }
}

/** What the cart's quote PDF put in writing (stamped by the quote-pdf route), if this quote has one. */
function cartPdfOf(quote: { metadata?: Record<string, any> | null }): { total: number; valid_until: string } | null {
  const c = quote.metadata?.cart_pdf
  return c && typeof c === "object" && typeof c.valid_until === "string" && Number.isFinite(Number(c.total))
    ? { total: Number(c.total), valid_until: c.valid_until }
    : null
}

/** The quote is the customer's: their id on it, or their email (case-insensitive). */
export function ownsQuote(
  quote: { customer_id?: string | null; email?: string | null },
  customerId: string,
  customerEmail: string | null | undefined
): boolean {
  if (quote.customer_id && quote.customer_id === customerId) return true
  const a = (quote.email ?? "").trim().toLowerCase()
  const b = (customerEmail ?? "").trim().toLowerCase()
  return !!a && a === b
}

export type CustomerQuoteLine = {
  title: string
  description: string | null
  sizes: string | null
  quantity: number
  unit_price: number | null
  unit_price_max: number | null
  total: number | null
  thumbnail: string | null
}

const SIZE_TOKEN = /^(xxs|xs|s|m|l|xl|\d?xl|[2-9]xl|1[0-9]xl|\d{1,3}|\d{1,2}[a-z]?|one size|os)$/i
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * One row per garment + colour: the one-line-per-size rows a quote carries
 * ("Staple Tee — Black / M") fold into "S 4 · M 10". `showPrices: false`
 * blanks every price (quotes we haven't sent yet).
 */
export function summariseQuoteLines(rawItems: unknown, showPrices = true): CustomerQuoteLine[] {
  const items = Array.isArray(rawItems) ? (rawItems as Array<Record<string, any>>) : []
  const groups = new Map<string, { line: CustomerQuoteLine; sizes: string[] }>()
  for (const li of items) {
    const fullTitle = typeof li?.title === "string" && li.title.trim() ? li.title.trim() : "Item"
    const m = fullTitle.match(/^(.*?)\s*\/\s*([^/]+)$/)
    const size = m && SIZE_TOKEN.test(m[2].trim()) ? m[2].trim() : null
    const title = size ? m![1].trim() : fullTitle.replace(/\s*\(any size\)$/i, "")
    const qty = num(li?.quantity) ?? 0
    const unit = showPrices ? num(li?.unit_price) : null
    const total = showPrices ? num(li?.total) ?? (unit != null ? round2(unit * qty) : null) : null
    const key = `${li?.group_id ?? ""}|${title}`
    let g = groups.get(key)
    if (!g) {
      g = {
        line: {
          title,
          description: typeof li?.description === "string" && li.description.trim() ? li.description.trim() : null,
          sizes: null,
          quantity: 0,
          unit_price: unit,
          unit_price_max: unit,
          total: total == null ? null : 0,
          thumbnail: null,
        },
        sizes: [],
      }
      groups.set(key, g)
    }
    g.line.quantity += qty
    if (total != null) g.line.total = round2((g.line.total ?? 0) + total)
    if (unit != null) {
      g.line.unit_price = g.line.unit_price == null ? unit : Math.min(g.line.unit_price, unit)
      g.line.unit_price_max = g.line.unit_price_max == null ? unit : Math.max(g.line.unit_price_max, unit)
    }
    if (!g.line.thumbnail && typeof li?.thumbnail === "string" && li.thumbnail) g.line.thumbnail = li.thumbnail
    if (size) g.sizes.push(`${size} ${qty}`)
  }
  return Array.from(groups.values()).map((g) => ({ ...g.line, sizes: g.sizes.length ? g.sizes.join(" · ") : null }))
}

export type CustomerQuoteSummary = {
  id: string
  public_id: string
  status: CustomerQuoteStatus
  status_label: string
  subject: string | null
  created_at: string | null
  quoted_at: string | null
  expires_at: string | null
  currency_code: string
  /** inc GST. null until we have sent the quote. */
  total: number | null
  lines: CustomerQuoteLine[]
  can_accept: boolean
}

const iso = (v: unknown): string | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** List/detail core. `items` is `quote.line_items.items` (or the slim SQL projection of it). */
export function customerQuoteSummary(quote: Record<string, any>, items: unknown, now: Date = new Date()): CustomerQuoteSummary {
  const status = customerQuoteStatus(quote, now)
  // A cart quote shows the total and date its PDF gave, nothing else priced.
  const cartPdf = status.key === "cart" || (status.key === "expired" && quote.status === "new") ? cartPdfOf(quote) : null
  // Prices show once we've sent the quote. A `new` quote may hold staff's draft numbers.
  const showPrices = status.key !== "waiting" && !cartPdf
  const lines = summariseQuoteLines(items, showPrices)
  const lineSum = lines.reduce((s, l) => s + (l.total ?? 0), 0)
  return {
    id: String(quote.id),
    public_id: String(quote.public_id ?? ""),
    status: status.key,
    status_label: status.label,
    subject: typeof quote.subject === "string" && quote.subject.trim() ? quote.subject.trim() : null,
    created_at: iso(quote.created_at),
    quoted_at: iso(quote.quoted_at),
    expires_at: iso(cartPdf?.valid_until ?? quote.expires_at),
    currency_code: String(quote.currency_code ?? "aud").toLowerCase(),
    total: cartPdf ? cartPdf.total : showPrices ? num(quote.total_estimate) ?? (lines.length ? round2(lineSum) : null) : null,
    lines,
    can_accept: status.key === "ready",
  }
}
