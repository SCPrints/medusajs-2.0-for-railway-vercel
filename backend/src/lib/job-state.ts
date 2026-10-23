/**
 * Job state — pure. Given a slim snapshot of a quote and/or its order, says
 * where the job is (phase steps), who it is waiting on, and the ONE next
 * action staff should take. Drives the Job page header + Today list.
 *
 * NO `@medusajs/framework` imports: this file is bundled into the admin SPA
 * (see feedback_admin_bundle_no_framework_imports). Keep it data-in, data-out.
 */
import { businessDaysBetween } from "./business-days"
import type { ArtworkStage, BlanksStage, DownstreamStage } from "./production-stage"

export type JobPhaseKey =
  | "enquiry"
  | "quoted"
  | "accepted"
  | "paid"
  | "artwork"
  | "blanks"
  | "production"
  | "shipped"
  | "delivered"

export const JOB_PHASES: { key: JobPhaseKey; label: string }[] = [
  { key: "enquiry", label: "Enquiry" },
  { key: "quoted", label: "Quoted" },
  { key: "accepted", label: "Accepted" },
  { key: "paid", label: "Paid" },
  { key: "artwork", label: "Artwork" },
  { key: "blanks", label: "Blanks" },
  { key: "production", label: "Production" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
]

export type WaitingOn = "us" | "customer" | "supplier" | null

export type NextActionKind =
  | "reply"
  | "price_it"
  | "revise_design"
  | "nudge_quote"
  | "convert_to_order"
  | "send_payment_link"
  | "nudge_payment"
  | "send_proof"
  | "wait_proof"
  | "revise_proof"
  | "order_blanks"
  | "mark_arrived"
  | "start_production"
  | "qc_done"
  | "mark_shipped"
  | "collected"
  | "follow_up"
  | "none"

export type NextAction = {
  kind: NextActionKind
  label: string
  /** Which tab the action lives on when it isn't a one-click POST. */
  tab?: "overview" | "artwork" | "production" | "delivery" | "activity"
  /** Why the job can't move yet (production gate). */
  blockers?: string[]
}

export type JobSnapshot = {
  quote?: {
    status: "new" | "quoted" | "accepted" | "lost" | "expired" | string
    created_at: string | null
    quoted_at: string | null
    accepted_at: string | null
    has_prices: boolean
    design_changes_requested_at: string | null
    design_approved_at: string | null
  } | null
  order?: {
    created_at: string | null
    status: string
    paid: boolean
    deposit_required: boolean
    deposit_paid: boolean
    has_open_payment_link: boolean
    tracks: { artwork: ArtworkStage; blanks: BlanksStage; downstream: DownstreamStage }
    artwork_stage_changed_at: string | null
    artwork_changes_requested_at: string | null
    blanks_stage_changed_at: string | null
    production_stage_changed_at: string | null
    has_decorated_lines: boolean
    gate_failures: string[]
    /** Dollars still owing (null when the total is unknown). */
    outstanding?: number | null
    /** Customer on account terms: payment is chased after delivery, not before proof. */
    balance_due_at?: string | null
    /** Rung up at the POS (metadata.pos_session_id). */
    pos_sale?: boolean
    /** Newest revised proof staff made (metadata.revised_proofs[].uploaded_at). */
    revised_proof_at?: string | null
  } | null
  /** Latest customer email / change request we have not answered. */
  last_inbound_at: string | null
  /** Latest email/note from staff to the customer. */
  last_outbound_at: string | null
  /** Earliest open "Follow up on…" task date (task metadata.follow_up). */
  follow_up_at?: string | null
  now: Date
}

export type JobState = {
  phase: JobPhaseKey
  steps: { key: JobPhaseKey; label: string; done: boolean; at: string | null }[]
  waiting_on: WaitingOn
  /** When the current wait started (ISO). */
  since: string | null
  /** Business days waited. */
  days: number
  next_action: NextAction
  lost: boolean
}

/** Written by the reply route on outbound staff emails / composer notes. */
export const STAFF_EMAIL_ACTOR_PREFIX = "staff-email:"
export const STAFF_NOTE_ACTOR_PREFIX = "staff-note:"

/**
 * Latest customer email and latest staff answer, from a job's activity feed.
 * An answer is an email to the customer or a call/note logged from the job's
 * composer (actor prefixed staff-note:). Supplier emails (DSP) and proof
 * change requests are neither: the change-request rules handle those.
 */
export function threadTimes(activity: { kind: string; at: string; actor?: string | null }[]): {
  inbound: string[]
  last_inbound_at: string | null
  answers: string[]
} {
  const inbound = activity.filter((a) => a.kind === "email_in").map((a) => a.at).sort()
  const answers = activity
    .filter((a) => a.kind === "email_out" || (a.kind === "note" && !!a.actor?.startsWith(STAFF_NOTE_ACTOR_PREFIX)))
    .map((a) => a.at)
  return { inbound, last_inbound_at: inbound.at(-1) ?? null, answers }
}

const ts = (v: string | null | undefined): number => (v ? Date.parse(v) || 0 : 0)
const later = (...vs: (string | null | undefined)[]): string | null =>
  vs.filter((v): v is string => !!v && Number.isFinite(Date.parse(v))).sort().at(-1) ?? null

const NUDGE_AFTER_BUSINESS_DAYS = 2

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" })

export function deriveJobState(s: JobSnapshot): JobState {
  const st = deriveBaseState(s)
  // A follow-up date parks a job that's waiting on the customer: no nudging
  // until the date, then it's ours to chase ("Follow up").
  if (st.waiting_on !== "customer" || !s.follow_up_at) return st
  if (ts(s.follow_up_at) > s.now.getTime()) {
    return { ...st, since: null, days: 0, next_action: { ...st.next_action, label: `Follow up ${shortDate(s.follow_up_at)}` } }
  }
  return {
    ...st,
    waiting_on: "us",
    since: s.follow_up_at,
    days: businessDaysBetween(new Date(s.follow_up_at), s.now),
    next_action: { kind: "follow_up", label: "Follow up", tab: "activity" },
  }
}

function deriveBaseState(s: JobSnapshot): JobState {
  const q = s.quote ?? null
  const o = s.order ?? null
  const now = s.now

  // A deposit, when asked for, is always enforced. Without one, a customer on
  // account terms (balance_due_at) doesn't pay before proof — the balance is
  // chased after delivery.
  const paidOk = !!o && (o.paid || (o.deposit_required ? o.deposit_paid : !!o.balance_due_at))
  const tracks = o?.tracks
  const downstreamIndex = ["received", "in_production", "quality_check", "shipped", "delivered"]
  const dIdx = tracks ? downstreamIndex.indexOf(tracks.downstream) : -1

  const steps: JobState["steps"] = [
    { key: "enquiry", label: "Enquiry", done: !!q || !!o, at: q?.created_at ?? o?.created_at ?? null },
    { key: "quoted", label: "Quoted", done: !!o || (!!q && q.status !== "new"), at: q?.quoted_at ?? null },
    { key: "accepted", label: "Accepted", done: !!o || q?.status === "accepted", at: q?.accepted_at ?? o?.created_at ?? null },
    // The strip shows money actually received; terms customers aren't "Paid" yet.
    { key: "paid", label: "Paid", done: !!o && (o.paid || (o.deposit_required && o.deposit_paid)), at: null },
    { key: "artwork", label: "Artwork", done: tracks?.artwork === "approved", at: tracks?.artwork === "approved" ? o?.artwork_stage_changed_at ?? null : null },
    { key: "blanks", label: "Blanks", done: tracks?.blanks === "arrived" || dIdx >= 1, at: tracks?.blanks === "arrived" ? o?.blanks_stage_changed_at ?? null : null },
    { key: "production", label: "Production", done: dIdx >= 3, at: dIdx >= 3 ? o?.production_stage_changed_at ?? null : null },
    { key: "shipped", label: "Shipped", done: dIdx >= 3, at: dIdx === 3 ? o?.production_stage_changed_at ?? null : null },
    { key: "delivered", label: "Delivered", done: dIdx >= 4, at: dIdx === 4 ? o?.production_stage_changed_at ?? null : null },
  ]
  // Phase = the last completed step (first incomplete is the one "in progress").
  const lastDone = [...steps].reverse().find((st) => st.done)
  const phase: JobPhaseKey = lastDone?.key ?? "enquiry"

  const lost = (!o && (q?.status === "lost" || q?.status === "expired")) || o?.status === "canceled"

  const wait = (waiting_on: WaitingOn, since: string | null, next_action: NextAction): JobState => ({
    phase,
    steps,
    waiting_on,
    since,
    days: since ? businessDaysBetween(new Date(since), now) : 0,
    next_action,
    lost,
  })

  if (lost) return wait(null, null, { kind: "none", label: "Closed" })

  // Finished jobs first — but a job isn't finished while money is owed.
  const finished = !!o && (tracks!.downstream === "delivered" || tracks!.downstream === "shipped")
  const owing = !!o && !o.paid && (o.outstanding ?? 0) > 0.01
  if (finished && !owing) {
    return wait(null, null, { kind: "none", label: tracks!.downstream === "shipped" ? "In transit" : "Delivered" })
  }

  // The customer wrote to us and we haven't replied: always the first thing.
  if (s.last_inbound_at && ts(s.last_inbound_at) > ts(s.last_outbound_at)) {
    return wait("us", s.last_inbound_at, { kind: "reply", label: "Reply", tab: "activity" })
  }

  // ── No order yet: the quote drives it ────────────────────────────────────
  if (!o) {
    if (!q) return wait(null, null, { kind: "none", label: "—" })
    if (q.status === "accepted") {
      return wait("us", q.accepted_at, { kind: "convert_to_order", label: "Convert to order", tab: "overview" })
    }
    if (q.status === "new" || !q.has_prices) {
      return wait("us", q.created_at, { kind: "price_it", label: "Price it", tab: "overview" })
    }
    // quoted
    if (q.design_changes_requested_at && ts(q.design_changes_requested_at) > ts(q.design_approved_at)) {
      return wait("us", q.design_changes_requested_at, { kind: "revise_design", label: "Revise the design", tab: "artwork" })
    }
    const since = later(q.quoted_at, s.last_outbound_at)
    const days = since ? businessDaysBetween(new Date(since), now) : 0
    return wait("customer", since, {
      kind: "nudge_quote",
      label: days >= NUDGE_AFTER_BUSINESS_DAYS ? "Nudge" : `Nudge in ${NUDGE_AFTER_BUSINESS_DAYS - days}d`,
    })
  }

  // ── Order exists ──────────────────────────────────────────────────────────
  const t = tracks!
  if (finished) {
    // Shipped or delivered with a balance owing.
    const overdue = !!o.balance_due_at && ts(o.balance_due_at) < now.getTime()
    return wait("customer", overdue ? o.balance_due_at! : o.production_stage_changed_at, {
      kind: "nudge_payment",
      label: overdue ? "Chase balance (overdue)" : "Chase balance",
    })
  }
  if (t.downstream === "in_production") {
    return wait("us", o.production_stage_changed_at, { kind: "qc_done", label: "QC done" })
  }
  if (t.downstream === "quality_check") {
    return wait("us", o.production_stage_changed_at, { kind: "mark_shipped", label: "Mark shipped" })
  }

  // Changes requested on the proof: revise before anything else.
  if (
    o.artwork_changes_requested_at &&
    t.artwork !== "approved" &&
    ts(o.artwork_changes_requested_at) >= ts(o.artwork_stage_changed_at)
  ) {
    // Once a revised proof exists, the next step is sending it.
    if (o.revised_proof_at && ts(o.revised_proof_at) > ts(o.artwork_changes_requested_at)) {
      return wait("us", o.artwork_changes_requested_at, { kind: "send_proof", label: "Send revised proof", tab: "artwork" })
    }
    return wait("us", o.artwork_changes_requested_at, { kind: "revise_proof", label: "Revise the proof", tab: "artwork" })
  }

  if (!paidOk) {
    if (!o.has_open_payment_link) {
      return wait("us", o.created_at, { kind: "send_payment_link", label: "Send payment link", tab: "overview" })
    }
    const since = later(o.created_at, s.last_outbound_at)
    const days = since ? businessDaysBetween(new Date(since), now) : 0
    return wait("customer", since, {
      kind: "nudge_payment",
      label: days >= NUDGE_AFTER_BUSINESS_DAYS ? "Nudge" : `Nudge in ${NUDGE_AFTER_BUSINESS_DAYS - days}d`,
    })
  }

  if (o.has_decorated_lines && t.artwork !== "approved") {
    if (t.artwork === "awaiting_approval") {
      return wait("customer", o.artwork_stage_changed_at, { kind: "wait_proof", label: "Proof sent", tab: "artwork" })
    }
    return wait("us", o.artwork_stage_changed_at ?? o.created_at, { kind: "send_proof", label: "Send proof", tab: "artwork" })
  }

  if (o.has_decorated_lines && t.blanks !== "arrived") {
    if (t.blanks === "ordered") {
      return wait("supplier", o.blanks_stage_changed_at, { kind: "mark_arrived", label: "Mark blanks arrived", tab: "delivery" })
    }
    return wait("us", o.blanks_stage_changed_at ?? o.created_at, { kind: "order_blanks", label: "Order blanks", tab: "delivery" })
  }

  // A walk-in stock sale: nothing to make, the customer takes it with them.
  if (o.pos_sale && !o.has_decorated_lines) {
    return wait("us", o.created_at, { kind: "collected", label: "Collected" })
  }

  // received, everything in place
  return wait("us", later(o.artwork_stage_changed_at, o.blanks_stage_changed_at, o.created_at), {
    kind: "start_production",
    label: "Start production",
    blockers: o.gate_failures.length ? o.gate_failures : undefined,
  })
}
