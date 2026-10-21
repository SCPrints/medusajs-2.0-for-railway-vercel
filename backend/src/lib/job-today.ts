/**
 * Today list — pure section rules over job states. Admin-safe (no framework
 * imports). Each job lands in exactly one section:
 *
 *   waiting_on_us      the customer (or an enquiry) is waiting on a human
 *   ready              we can move it now, or a supplier owes us blanks
 *   waiting_on_customer we've asked; they haven't answered
 *
 * Shipped / delivered / closed jobs are left off. Flags and due dates are
 * badges on the row, not sections, so nothing appears twice.
 */
import type { JobState, NextActionKind, WaitingOn } from "./job-state"
import type { JobView } from "./job-view"

export type TodaySection = "waiting_on_us" | "ready" | "waiting_on_customer"

export type TodayRow = {
  id: string
  kind: "quote" | "order"
  /** "#114" or "Q-4GY0KD74V2". */
  label: string
  customer: string
  subject: string | null
  phase: JobState["phase"]
  waiting_on: WaitingOn
  days: number
  since: string | null
  next_action: JobState["next_action"]
  total: number | null
  currency_code: string
  flags: JobView["flags"]
  due_date: string | null
  last_activity: { kind: string; title: string; at: string } | null
  order_id: string | null
  quote_id: string | null
  display_id: number | null
  outstanding: number | null
}

export type TodayView = {
  generated_at: string
  sections: Record<TodaySection, TodayRow[]>
  counts: Record<TodaySection, number> & { total: number }
}

const CUSTOMER_WAITING: ReadonlySet<NextActionKind> = new Set([
  "reply",
  "price_it",
  "revise_design",
  "convert_to_order",
  "send_payment_link",
  "revise_proof",
])

export function sectionFor(state: JobState): TodaySection | null {
  if (state.lost || state.next_action.kind === "none") return null
  if (state.waiting_on === "us" && CUSTOMER_WAITING.has(state.next_action.kind)) return "waiting_on_us"
  if (state.waiting_on === "us" || state.waiting_on === "supplier") return "ready"
  if (state.waiting_on === "customer") return "waiting_on_customer"
  return null
}

export function rowFromJob(job: JobView): TodayRow {
  const last = job.activity[0] ?? null
  return {
    id: job.id,
    kind: job.kind,
    // public_id already carries the "Q-" prefix.
    label: job.order ? `#${job.order.display_id ?? ""}` : job.quote?.public_id ?? "",
    customer: job.customer.name ?? job.customer.email ?? "Customer",
    subject: job.quote?.subject ?? null,
    phase: job.state.phase,
    waiting_on: job.state.waiting_on,
    days: job.state.days,
    since: job.state.since,
    next_action: job.state.next_action,
    total: job.money.order_total ?? job.money.quoted,
    currency_code: job.money.currency_code,
    flags: job.flags,
    due_date: job.order?.production_due_date ?? null,
    last_activity: last ? { kind: last.kind, title: last.title, at: last.at } : null,
    order_id: job.order?.id ?? null,
    quote_id: job.quote?.id ?? null,
    display_id: job.order?.display_id ?? null,
    outstanding: job.money.outstanding,
  }
}

/** Longest wait first; a job with flags outranks one without at equal days. */
const byUrgency = (a: TodayRow, b: TodayRow) =>
  b.days - a.days || b.flags.length - a.flags.length || (a.since ?? "").localeCompare(b.since ?? "")

export function groupToday(jobs: JobView[], now: Date = new Date()): TodayView {
  const sections: Record<TodaySection, TodayRow[]> = { waiting_on_us: [], ready: [], waiting_on_customer: [] }
  for (const job of jobs) {
    const section = sectionFor(job.state)
    if (!section) continue
    sections[section].push(rowFromJob(job))
  }
  for (const key of Object.keys(sections) as TodaySection[]) sections[key].sort(byUrgency)
  const counts = {
    waiting_on_us: sections.waiting_on_us.length,
    ready: sections.ready.length,
    waiting_on_customer: sections.waiting_on_customer.length,
    total: 0,
  }
  counts.total = counts.waiting_on_us + counts.ready + counts.waiting_on_customer
  return { generated_at: now.toISOString(), sections, counts }
}
