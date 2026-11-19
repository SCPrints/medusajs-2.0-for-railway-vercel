/**
 * Spend report + statement of invoices for the customer account
 * (/account/spend). Pure — unit-tested. Money is AUD major units, GST-inclusive.
 */
import { poNumberFromMetadata } from "./po-number"

export type SpendOrder = {
  id: string
  display_id: string | null
  created_at: string
  currency_code: string
  total: number
  paid: number
  po_number: string | null
  cost_centre: string | null
}

export type PaymentStatus = "paid" | "part_paid" | "outstanding" | "refunded"

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown): number => {
  const n = v && typeof v === "object" ? Number((v as any).value ?? v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Cost centre as a label, whatever shape the order carries (plain text, or { name | code | id }). */
export function costCentreLabel(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    for (const k of ["name", "label", "code", "id"]) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim()
  }
  return null
}

/**
 * An order row from query.graph (`summary.*` requested) → what the report
 * needs. Total is the order as it stands (`summary.current_order_total`, right
 * before and after the inc-GST cutover; 0 once fully refunded). null for
 * cancelled and draft orders, which are not spend.
 */
export function toSpendOrder(raw: any): SpendOrder | null {
  if (!raw?.id || raw.canceled_at || raw.status === "canceled" || raw.status === "draft") return null
  const summary = (raw.summary ?? {}) as Record<string, unknown>
  const meta = (raw.metadata ?? {}) as Record<string, unknown>
  const created = raw.created_at instanceof Date ? raw.created_at : new Date(String(raw.created_at))
  if (Number.isNaN(created.getTime())) return null
  return {
    id: String(raw.id),
    display_id: raw.display_id != null ? String(raw.display_id) : null,
    created_at: created.toISOString(),
    currency_code: String(raw.currency_code ?? "aud").toLowerCase(),
    total: round2(num(summary.current_order_total ?? summary.raw_current_order_total ?? raw.total)),
    paid: round2(num(summary.paid_total ?? summary.raw_paid_total)),
    po_number: poNumberFromMetadata(meta) ?? (typeof meta.external_ref === "string" && meta.external_ref.trim() ? meta.external_ref.trim() : null),
    cost_centre: costCentreLabel(meta.cost_centre),
  }
}

export function paymentStatus(total: number, paid: number): PaymentStatus {
  if (total <= 0.005) return paid > 0.005 ? "refunded" : "paid"
  if (paid >= total - 0.01) return "paid"
  return paid > 0.01 ? "part_paid" : "outstanding"
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  part_paid: "Part paid",
  outstanding: "Outstanding",
  refunded: "Refunded",
}

const SYDNEY_MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit" })
/** "2026-11" for the month the instant falls in, Sydney time. */
export const monthKey = (d: Date | string): string => SYDNEY_MONTH.format(new Date(d)).slice(0, 7)

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export type MonthBucket = { month: string; label: string; total: number; orders: number }

/** The last `months` months up to `now`, oldest first, months with no orders included as zero. */
export function bucketByMonth(orders: SpendOrder[], now: Date = new Date(), months = 24): MonthBucket[] {
  const [y, m] = monthKey(now).split("-").map(Number)
  const buckets: MonthBucket[] = []
  for (let i = months - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i
    const year = Math.floor(idx / 12)
    const month = idx % 12
    buckets.push({ month: `${year}-${String(month + 1).padStart(2, "0")}`, label: `${MONTH_NAMES[month]} ${year}`, total: 0, orders: 0 })
  }
  const byKey = new Map(buckets.map((b) => [b.month, b]))
  for (const o of orders) {
    const b = byKey.get(monthKey(o.created_at))
    if (!b) continue
    b.total = round2(b.total + o.total)
    b.orders += 1
  }
  return buckets
}

export type CostCentreBucket = { cost_centre: string; total: number; orders: number }

/** Spend per cost centre, biggest first. Empty when no order carries one. */
export function bucketByCostCentre(orders: SpendOrder[]): CostCentreBucket[] {
  if (!orders.some((o) => o.cost_centre)) return []
  const map = new Map<string, CostCentreBucket>()
  for (const o of orders) {
    const key = o.cost_centre ?? "No cost centre"
    const b = map.get(key) ?? { cost_centre: key, total: 0, orders: 0 }
    b.total = round2(b.total + o.total)
    b.orders += 1
    map.set(key, b)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export type StatementRow = {
  order_id: string
  display_id: string | null
  date: string
  po_number: string | null
  cost_centre: string | null
  total: number
  paid: number
  outstanding: number
  status: PaymentStatus
  status_label: string
}

/** One row per order, newest first. */
export function statementRows(orders: SpendOrder[]): StatementRow[] {
  return [...orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((o) => {
      const status = paymentStatus(o.total, o.paid)
      return {
        order_id: o.id,
        display_id: o.display_id,
        date: o.created_at,
        po_number: o.po_number,
        cost_centre: o.cost_centre,
        total: o.total,
        paid: round2(Math.min(o.paid, o.total)),
        outstanding: round2(Math.max(0, o.total - o.paid)),
        status,
        status_label: PAYMENT_STATUS_LABEL[status],
      }
    })
}

export type SpendReport = {
  generated_at: string
  months: MonthBucket[]
  cost_centres: CostCentreBucket[]
  statement: StatementRow[]
  totals: { spend: number; paid: number; outstanding: number; orders: number }
}

export function buildSpendReport(orders: SpendOrder[], now: Date = new Date(), months = 24): SpendReport {
  const earliest = bucketByMonth([], now, months)[0].month
  const inWindow = orders.filter((o) => monthKey(o.created_at) >= earliest)
  const statement = statementRows(inWindow)
  return {
    generated_at: now.toISOString(),
    months: bucketByMonth(inWindow, now, months),
    cost_centres: bucketByCostCentre(inWindow),
    statement,
    totals: {
      spend: round2(statement.reduce((s, r) => s + r.total, 0)),
      paid: round2(statement.reduce((s, r) => s + r.paid, 0)),
      outstanding: round2(statement.reduce((s, r) => s + r.outstanding, 0)),
      orders: statement.length,
    },
  }
}

const sydneyDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })

export function statementCsvRows(report: SpendReport): Array<Array<string | number>> {
  return [
    ["Date", "Order", "PO number", "Cost centre", "Total (inc GST)", "Paid", "Outstanding", "Status"],
    ...report.statement.map((r) => [
      sydneyDate(r.date),
      r.display_id ? `#${r.display_id}` : r.order_id,
      r.po_number ?? "",
      r.cost_centre ?? "",
      r.total.toFixed(2),
      r.paid.toFixed(2),
      r.outstanding.toFixed(2),
      r.status_label,
    ]),
    [],
    ["Total", "", "", "", report.totals.spend.toFixed(2), report.totals.paid.toFixed(2), report.totals.outstanding.toFixed(2), ""],
  ]
}
