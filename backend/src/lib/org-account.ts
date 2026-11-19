/**
 * Buying on account: the rules, as pure functions (no framework import, so
 * the admin bundle can use them too). All money is AUD inc GST, major units.
 *
 * Callers: services/org-account (checkout guard, account summary), the
 * organisation store/admin routes, and their tests.
 */
export type OrgRole = "owner" | "purchaser" | "viewer"

/** Medusa's "manual" provider: marks an order placed without taking money. */
export const SYSTEM_PAYMENT_PROVIDER = "pp_system_default"
export const isSystemPaymentProvider = (id: unknown): boolean =>
  typeof id === "string" && id.startsWith("pp_system")

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** A bigNumber column / BigNumber object / numeric string → number, else null. */
export function money(v: unknown): number | null {
  if (v == null || v === "") return null
  const raw = typeof v === "object" ? ((v as any).value ?? (v as any).numeric ?? Number(v as any)) : v
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Only owners and purchasers place orders for an organisation. */
export const canOrderForOrg = (role: OrgRole | null | undefined): boolean =>
  role === "owner" || role === "purchaser"

export function accountDueDate(now: Date, days: number): string {
  const d = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  return new Date(now.getTime() + d * 86_400_000).toISOString()
}

/** Unpaid on-account orders + this order must fit under the credit limit (null = no limit). */
export function creditCheck(input: {
  limit: number | null
  outstanding: number
  total: number
}): { ok: boolean; available: number | null } {
  if (input.limit == null) return { ok: true, available: null }
  const available = round2(Math.max(0, input.limit - input.outstanding))
  return { ok: input.total <= available + 0.005, available }
}

export const poRemaining = (amount: number, drawn: number): number =>
  round2(Math.max(0, amount - drawn))

export type PoCheck =
  | { ok: true; remaining: number }
  | { ok: false; reason: "inactive" | "expired" | "insufficient"; remaining: number }

export function poCheck(input: {
  amount: number
  is_active: boolean
  expires_at: string | Date | null
  drawn: number
  total: number
  now: Date
}): PoCheck {
  const remaining = poRemaining(input.amount, input.drawn)
  if (!input.is_active) return { ok: false, reason: "inactive", remaining }
  if (input.expires_at && new Date(input.expires_at).getTime() < input.now.getTime()) {
    return { ok: false, reason: "expired", remaining }
  }
  if (input.total > remaining + 0.005) return { ok: false, reason: "insufficient", remaining }
  return { ok: true, remaining }
}

export type LimitCheck =
  | { ok: true }
  | { ok: false; reason: "order_limit" | "monthly_limit"; limit: number }

/** A member's own limits. Over either one → the order needs an owner's approval. */
export function limitCheck(input: {
  order_limit: number | null
  monthly_limit: number | null
  month_spend: number
  total: number
}): LimitCheck {
  if (input.order_limit != null && input.total > input.order_limit + 0.005) {
    return { ok: false, reason: "order_limit", limit: input.order_limit }
  }
  if (input.monthly_limit != null && input.month_spend + input.total > input.monthly_limit + 0.005) {
    return { ok: false, reason: "monthly_limit", limit: input.monthly_limit }
  }
  return { ok: true }
}

/** Owners approve. Not their own request, unless they are the only owner. */
export function canApprove(input: {
  role: OrgRole
  isRequester: boolean
  ownerCount: number
}): boolean {
  if (input.role !== "owner") return false
  return !input.isRequester || input.ownerCount <= 1
}

export type InvoiceStatus = "paid" | "outstanding" | "overdue"

export function invoiceStatus(input: {
  total: number
  paid: number
  due_at: string | null
  now: Date
}): InvoiceStatus {
  if (input.total - input.paid <= 0.005) return "paid"
  if (input.due_at && new Date(input.due_at).getTime() < input.now.getTime()) return "overdue"
  return "outstanding"
}

/** One organisation order, as the sums below need it. */
export type OrgOrderRow = {
  id: string
  customer_id: string | null
  created_at: string | Date
  canceled: boolean
  total: number
  paid: number
  metadata: Record<string, unknown> | null
}

// ponytail: Sydney month = UTC+10, ignoring the daylight-saving hour.
const monthKey = (d: string | Date) =>
  new Date(new Date(d).getTime() + 10 * 3_600_000).toISOString().slice(0, 7)

/** Everything the rules need from an organisation's orders, in one pass. */
export function summariseOrgOrders(
  orders: OrgOrderRow[],
  now: Date
): {
  /** Unpaid balance of on-account orders. */
  outstanding: number
  /** Order totals drawn per blanket PO id. */
  po_drawn: Record<string, number>
  /** This month's order totals per customer id. */
  month_spend: Record<string, number>
} {
  let outstanding = 0
  const poDrawn: Record<string, number> = {}
  const monthSpend: Record<string, number> = {}
  const thisMonth = monthKey(now)
  for (const o of orders) {
    if (o.canceled) continue
    const meta = o.metadata ?? {}
    if (meta.account_terms) outstanding += Math.max(0, o.total - o.paid)
    const po = meta.organisation_po_id
    if (typeof po === "string" && po) poDrawn[po] = round2((poDrawn[po] ?? 0) + o.total)
    if (o.customer_id && monthKey(o.created_at) === thisMonth) {
      monthSpend[o.customer_id] = round2((monthSpend[o.customer_id] ?? 0) + o.total)
    }
  }
  return { outstanding: round2(outstanding), po_drawn: poDrawn, month_spend: monthSpend }
}
