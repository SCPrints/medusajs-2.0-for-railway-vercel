import type { JobState } from "../job-state"
import { dateRisk, groupToday, queueFor } from "../job-today"
import type { JobView } from "../job-view"

const NOW = new Date("2026-10-21T00:00:00.000Z") // Wed 21 Oct, 11:00 Sydney

const state = (over: Partial<JobState>): JobState => ({
  phase: "accepted",
  steps: [],
  waiting_on: "us",
  since: "2026-10-16T01:46:00.000Z",
  days: 3,
  next_action: { kind: "convert_to_order", label: "Convert to order" },
  lost: false,
  ...over,
})

const job = (id: string, st: Partial<JobState>, extra: Partial<JobView> = {}): JobView =>
  ({
    id,
    kind: "quote",
    title: id,
    // Real public ids carry the "Q-" prefix (rowFromJob uses them as-is).
    quote: { id, public_id: `Q-${id.toUpperCase()}`, status: "accepted", subject: null, assigned_to: null, total_estimate: 148, expires_at: null, quoted_at: null, accepted_at: null, has_job_pricer: false, design_approval_status: null, needed_by: null },
    order: null,
    customer: { id: null, name: "Dean", email: "d@x.com", phone: null, company: null, has_account: false },
    owner: null,
    address: { shipping: null, placeholder: false, found_in_thread: null },
    money: { currency_code: "aud", quoted: 148, order_total: null, paid: 0, outstanding: null, deposit_required_cents: 0, deposit_paid: false, open_payment_link: null },
    lines: [],
    pricing: null,
    flags: [],
    tasks: [],
    activity: [{ at: "2026-10-21T00:00:00.000Z", kind: "email_in", title: "Email from Dean", detail: null, actor: null }],
    unread_inbound: 1,
    state: state(st),
    ...extra,
  }) as JobView

const order = (over: Partial<NonNullable<JobView["order"]>> = {}): NonNullable<JobView["order"]> => ({
  id: "order_1",
  display_id: 118,
  status: "pending",
  payment_status: "captured",
  tracks: { artwork: "pending", blanks: "not_started", downstream: "received" },
  production_due_date: null,
  delivery_method: null,
  is_stale: false,
  rush_tier: null,
  needed_by: null,
  ...over,
})

describe("queueFor", () => {
  it("follows the next action, never the last finished step", () => {
    expect(queueFor(job("a", { next_action: { kind: "price_it", label: "" } }))).toBe("to_quote")
    expect(queueFor(job("a", { next_action: { kind: "nudge_quote", label: "" } }))).toBe("quoted")
    expect(queueFor(job("a", { next_action: { kind: "convert_to_order", label: "" } }))).toBe("waiting_payment")
    expect(queueFor(job("a", { next_action: { kind: "wait_proof", label: "" } }))).toBe("artwork")
    expect(queueFor(job("a", { next_action: { kind: "mark_arrived", label: "" } }))).toBe("blanks")
    expect(queueFor(job("a", { next_action: { kind: "qc_done", label: "" } }))).toBe("production")
    // An unpaid order with approved art is waiting on money, not artwork.
    expect(queueFor(job("a", { next_action: { kind: "nudge_payment", label: "" } }, { order: order({ tracks: { artwork: "approved", blanks: "arrived", downstream: "received" } }) }))).toBe("waiting_payment")
  })

  it("puts a new quote nobody has answered in New, and closed jobs in Done / Lost", () => {
    const newQuote = { ...job("a", {}).quote!, status: "new" }
    const priceIt = { next_action: { kind: "price_it" as const, label: "Price it" } }
    expect(queueFor(job("a", priceIt, { quote: newQuote }))).toBe("new")
    // Once staff have emailed or logged a call it is being quoted.
    const answered = [{ at: "2026-10-21T01:00:00.000Z", kind: "email_out" as const, title: "Email", detail: null, actor: "staff-email:sean@x.com" }]
    expect(queueFor(job("a", priceIt, { quote: newQuote, activity: answered }))).toBe("to_quote")
    expect(queueFor(job("a", { lost: true, next_action: { kind: "none", label: "Closed" } }))).toBe("lost")
    expect(queueFor(job("a", { next_action: { kind: "none", label: "Delivered" } }, { order: order({ tracks: { artwork: "approved", blanks: "arrived", downstream: "delivered" } }) }))).toBe("done")
  })

  it("falls back to where the job actually is for Reply / Follow up", () => {
    const reply = { kind: "reply" as const, label: "Reply" }
    const staffAnswer = { at: "2026-10-20T00:00:00.000Z", kind: "email_out" as const, title: "Email", detail: null, actor: "staff-email:sean@x.com" }
    expect(queueFor(job("a", { next_action: reply }, { quote: { ...job("a", {}).quote!, status: "new" }, activity: [...job("a", {}).activity, staffAnswer] }))).toBe("to_quote")
    expect(queueFor(job("a", { next_action: reply }))).toBe("quoted")
    expect(queueFor(job("a", { next_action: reply }, { order: order({ tracks: { artwork: "awaiting_approval", blanks: "not_started", downstream: "received" } }) }))).toBe("artwork")
    expect(queueFor(job("a", { next_action: reply }, { order: order({ tracks: { artwork: "approved", blanks: "ordered", downstream: "received" } }) }))).toBe("blanks")
    expect(queueFor(job("a", { next_action: reply }, { order: order({ tracks: { artwork: "approved", blanks: "arrived", downstream: "in_production" } }) }))).toBe("production")
  })
})

describe("dateRisk", () => {
  const o = (tracks: NonNullable<JobView["order"]>["tracks"], due: string | null = null) => ({ order: order({ tracks, production_due_date: due }), quote: null })
  const received = { artwork: "pending" as const, blanks: "not_started" as const, downstream: "received" as const }

  it("is late once the customer's date has passed and the job hasn't shipped", () => {
    expect(dateRisk(o(received), "2026-10-20", NOW)).toBe("late")
    expect(dateRisk(o({ ...received, downstream: "shipped" }), "2026-10-20", NOW)).toBeNull()
  })

  it("is at risk when our due date lands after theirs, or it's within 3 business days and nothing has started", () => {
    expect(dateRisk(o(received, "2026-11-10"), "2026-11-03", NOW)).toBe("at_risk")
    expect(dateRisk(o(received), "2026-10-23", NOW)).toBe("at_risk") // Fri, 2 business days
    expect(dateRisk(o({ ...received, downstream: "in_production" }), "2026-10-23", NOW)).toBeNull()
    expect(dateRisk(o(received), "2026-11-20", NOW)).toBeNull()
    expect(dateRisk(o(received), null, NOW)).toBeNull()
  })
})

describe("groupToday", () => {
  it("one list: late first, then rushed, then our move, then longest wait; counts per queue and a money/late summary", () => {
    const view = groupToday(
      [
        job("a", { days: 1 }),
        job("b", { days: 5 }),
        job("c", { days: 5 }, { flags: [{ kind: "no_order", label: "no order" }] }),
        job("d", { waiting_on: "customer", next_action: { kind: "nudge_quote", label: "Nudge" }, days: 2 }),
        job("e", { lost: true, waiting_on: null, next_action: { kind: "none", label: "Closed" } }),
        job("x", { days: 0, next_action: { kind: "send_proof", label: "Send proof" } }, { kind: "order", order: order({ rush_tier: "express" }), money: { currency_code: "aud", quoted: null, order_total: 500, paid: 100, outstanding: 400, deposit_required_cents: 0, deposit_paid: false, open_payment_link: null } }),
        job("l", { days: 0, waiting_on: "customer", next_action: { kind: "wait_proof", label: "Proof sent" } }, { kind: "order", order: order({ needed_by: "2026-10-19", tracks: { artwork: "awaiting_approval", blanks: "not_started", downstream: "received" } }) }),
      ],
      NOW
    )
    // Closed jobs sit in their folder, after every open one.
    expect(view.rows.map((r) => r.id)).toEqual(["l", "x", "c", "b", "a", "d", "e"])
    expect(view.rows[0]).toMatchObject({ risk: "late", queue: "artwork", needs_us: false })
    expect(view.rows.at(-1)).toMatchObject({ queue: "lost", closed: true, needs_us: false })
    expect(view.queues).toEqual({ new: 0, to_quote: 0, quoted: 1, artwork: 2, blanks: 0, production: 0, waiting_payment: 3, done: 0, lost: 1 })
    expect(view.needs_us).toBe(4)
    expect(view.summary).toEqual({ owed: 400, owed_jobs: 1, late: 1, at_risk: 0 })
    expect(view.rows.find((r) => r.id === "c")).toMatchObject({ label: "Q-C", customer: "Dean", total: 148, last_activity: { kind: "email_in" } })
  })
})
