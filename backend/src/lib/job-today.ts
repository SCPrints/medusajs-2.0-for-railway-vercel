/**
 * Jobs list — pure rules over job states. Admin-safe (no framework imports).
 *
 * One list, rushed and longest-waiting first. Each job sits in exactly one
 * folder (what it is waiting for right now — never the last finished step),
 * and "needs us" is the default view: every open job whose next move is ours.
 * Done and Lost hold recently finished jobs; they never count as needing us.
 */
import { businessDaysBetween } from "./business-days"
import { threadTimes, type JobState, type NextActionKind, type WaitingOn } from "./job-state"
import type { JobView } from "./job-view"

export type TodayQueue = "new" | "to_quote" | "quoted" | "waiting_payment" | "artwork" | "blanks" | "production" | "done" | "lost"

/** The folders, in the order they show. Keys are stable (URLs use them); labels are what staff see. */
export const TODAY_QUEUES: { key: TodayQueue; label: string }[] = [
  { key: "new", label: "New" },
  { key: "to_quote", label: "Quoting" },
  { key: "quoted", label: "Quote sent" },
  { key: "waiting_payment", label: "Payment" },
  { key: "artwork", label: "Artwork" },
  { key: "blanks", label: "Blanks" },
  { key: "production", label: "Production" },
  { key: "done", label: "Done" },
  { key: "lost", label: "Lost" },
]

export const CLOSED_QUEUES: ReadonlySet<TodayQueue> = new Set(["done", "lost"])

export type DateRisk = "late" | "at_risk" | null

export type TodayRow = {
  id: string
  kind: "quote" | "order"
  /** "#114" or "Q-4GY0KD74V2". */
  label: string
  customer: string
  subject: string | null
  phase: JobState["phase"]
  queue: TodayQueue
  /** Done or Lost. */
  closed: boolean
  /** The storefront's bot check flagged the enquiry. */
  bot: boolean
  /** Where a quote came from (contact, admin, cart, …); null for order-only jobs. */
  source: string | null
  needs_us: boolean
  waiting_on: WaitingOn
  days: number
  since: string | null
  next_action: JobState["next_action"]
  total: number | null
  currency_code: string
  flags: JobView["flags"]
  due_date: string | null
  needed_by: string | null
  risk: DateRisk
  last_activity: { kind: string; title: string; at: string } | null
  order_id: string | null
  quote_id: string | null
  display_id: number | null
  outstanding: number | null
  rush_tier: "priority" | "express" | null
}

export type TodayView = {
  generated_at: string
  rows: TodayRow[]
  queues: Record<TodayQueue, number>
  needs_us: number
  summary: {
    /** Dollars owing across open orders, and how many owe. */
    owed: number
    owed_jobs: number
    late: number
    at_risk: number
  }
}

const QUEUE_BY_ACTION: Partial<Record<NextActionKind, TodayQueue>> = {
  price_it: "to_quote",
  revise_design: "to_quote",
  nudge_quote: "quoted",
  convert_to_order: "waiting_payment",
  send_payment_link: "waiting_payment",
  nudge_payment: "waiting_payment",
  send_proof: "artwork",
  wait_proof: "artwork",
  revise_proof: "artwork",
  order_blanks: "blanks",
  mark_arrived: "blanks",
  start_production: "production",
  qc_done: "production",
  mark_shipped: "production",
  collected: "production",
}

/**
 * Which folder a job sits in. Lost and finished jobs first; then New — a quote
 * nobody has emailed or logged a call on yet; then by its next action when
 * that says, else (reply, follow-up) by where the job actually is.
 */
export function queueFor(job: Pick<JobView, "order" | "quote" | "state"> & { activity?: JobView["activity"] }): TodayQueue {
  if (job.state.lost) return "lost"
  if (job.state.next_action.kind === "none") return "done"
  if (!job.order && job.quote?.status === "new" && threadTimes(job.activity ?? []).answers.length === 0) return "new"
  const byAction = QUEUE_BY_ACTION[job.state.next_action.kind]
  if (byAction) return byAction
  const o = job.order
  if (!o) return job.quote?.status === "new" ? "to_quote" : "quoted"
  const d = o.tracks.downstream
  if (d === "in_production" || d === "quality_check" || d === "shipped" || d === "delivered") return "production"
  if (o.tracks.artwork !== "approved") return "artwork"
  if (o.tracks.blanks !== "arrived") return "blanks"
  return "production"
}

const DAY = 86_400_000
const day = (iso: string) => iso.slice(0, 10)

/**
 * Against the customer's own date (needed_by): late once it has passed and
 * the job hasn't shipped; at risk when our due date lands after it, or it is
 * within 3 business days and production hasn't started.
 */
export function dateRisk(job: Pick<JobView, "order" | "quote">, needed_by: string | null, now: Date): DateRisk {
  if (!needed_by) return null
  const d = job.order?.tracks.downstream
  if (d === "shipped" || d === "delivered") return null
  const today = day(now.toISOString())
  if (day(needed_by) < today) return "late"
  const due = job.order?.production_due_date
  if (due && day(due) > day(needed_by)) return "at_risk"
  const started = d === "in_production" || d === "quality_check"
  if (!started && businessDaysBetween(now, new Date(needed_by)) <= 3) return "at_risk"
  return null
}

export function rowFromJob(job: JobView, now: Date = new Date()): TodayRow {
  const last = job.activity[0] ?? null
  const needed_by = job.order?.needed_by ?? job.quote?.needed_by ?? null
  const queue = queueFor(job)
  const closed = CLOSED_QUEUES.has(queue)
  return {
    id: job.id,
    kind: job.kind,
    // public_id already carries the "Q-" prefix.
    label: job.order ? `#${job.order.display_id ?? ""}` : job.quote?.public_id ?? "",
    customer: job.customer.name ?? job.customer.email ?? "Customer",
    subject: job.quote?.subject ?? null,
    phase: job.state.phase,
    queue,
    closed,
    bot: job.flags.some((f) => f.kind === "bot"),
    source: job.quote?.source ?? null,
    needs_us: !closed && job.state.waiting_on === "us",
    waiting_on: job.state.waiting_on,
    days: job.state.days,
    since: job.state.since,
    next_action: job.state.next_action,
    total: job.money.order_total ?? job.money.quoted,
    currency_code: job.money.currency_code,
    flags: job.flags,
    due_date: job.order?.production_due_date ?? null,
    needed_by,
    risk: dateRisk(job, needed_by, now),
    last_activity: last ? { kind: last.kind, title: last.title, at: last.at } : null,
    order_id: job.order?.id ?? null,
    quote_id: job.quote?.id ?? null,
    display_id: job.order?.display_id ?? null,
    outstanding: job.money.outstanding,
    rush_tier: job.order?.rush_tier ?? null,
  }
}

const RUSH_RANK = { express: 2, priority: 1 } as const
const RISK_RANK = { late: 2, at_risk: 1 } as const
const rushRank = (r: TodayRow) => (r.rush_tier ? RUSH_RANK[r.rush_tier] : 0)
const riskRank = (r: TodayRow) => (r.risk ? RISK_RANK[r.risk] : 0)

/** Open before closed; late first, then rushed, then our move before theirs, then longest wait; flags, then latest activity break ties. */
const byUrgency = (a: TodayRow, b: TodayRow) =>
  Number(a.closed) - Number(b.closed) ||
  riskRank(b) - riskRank(a) ||
  rushRank(b) - rushRank(a) ||
  Number(b.needs_us) - Number(a.needs_us) ||
  b.days - a.days ||
  b.flags.length - a.flags.length ||
  (a.since ?? "").localeCompare(b.since ?? "") ||
  msOf(b.last_activity?.at) - msOf(a.last_activity?.at)

/** Activity times arrive as ISO strings or Date objects; compare as epoch ms. */
const msOf = (v: unknown): number => {
  const n = v ? new Date(v as string).getTime() : 0
  return Number.isFinite(n) ? n : 0
}

export function groupToday(jobs: JobView[], now: Date = new Date()): TodayView {
  const rows = jobs.map((j) => rowFromJob(j, now)).sort(byUrgency)
  const queues = Object.fromEntries(TODAY_QUEUES.map((q) => [q.key, 0])) as Record<TodayQueue, number>
  const summary = { owed: 0, owed_jobs: 0, late: 0, at_risk: 0 }
  for (const r of rows) {
    queues[r.queue] += 1
    if (r.closed) continue
    if (r.order_id && r.outstanding && r.outstanding > 0.01) {
      summary.owed += r.outstanding
      summary.owed_jobs += 1
    }
    if (r.risk === "late") summary.late += 1
    if (r.risk === "at_risk") summary.at_risk += 1
  }
  summary.owed = Math.round(summary.owed * 100) / 100
  return { generated_at: now.toISOString(), rows, queues, needs_us: rows.filter((r) => r.needs_us).length, summary }
}

// ponytail: kept so the Enquiries tab can age rows the same way Today does.
export const daysAgo = (iso: string, now: Date = new Date()) => Math.floor((now.getTime() - Date.parse(iso)) / DAY)
