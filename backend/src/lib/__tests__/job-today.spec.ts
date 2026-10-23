import type { JobState } from "../job-state"
import { groupToday, sectionFor } from "../job-today"
import type { JobView } from "../job-view"

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

const job = (id: string, st: Partial<JobState>, flags: JobView["flags"] = []): JobView =>
  ({
    id,
    kind: "quote",
    title: id,
    // Real public ids carry the "Q-" prefix (rowFromJob uses them as-is).
    quote: { id, public_id: `Q-${id.toUpperCase()}`, status: "accepted", subject: null, assigned_to: null, total_estimate: 148, expires_at: null, quoted_at: null, accepted_at: null, has_job_pricer: false, design_approval_status: null },
    order: null,
    customer: { id: null, name: "Dean", email: "d@x.com", phone: null, company: null, has_account: false },
    owner: null,
    address: { shipping: null, placeholder: false, found_in_thread: null },
    money: { currency_code: "aud", quoted: 148, order_total: null, paid: 0, outstanding: null, deposit_required_cents: 0, deposit_paid: false, open_payment_link: null },
    lines: [],
    flags,
    tasks: [],
    activity: [{ at: "2026-10-21T00:00:00.000Z", kind: "email_in", title: "Email from Dean", detail: null, actor: null }],
    unread_inbound: 1,
    state: state(st),
  }) as JobView

describe("sectionFor", () => {
  it("puts customer-facing waits first, our own moves second, their silence third, finished nowhere", () => {
    expect(sectionFor(state({ next_action: { kind: "reply", label: "Reply" } }))).toBe("waiting_on_us")
    expect(sectionFor(state({ next_action: { kind: "start_production", label: "Start" } }))).toBe("ready")
    expect(sectionFor(state({ waiting_on: "supplier", next_action: { kind: "mark_arrived", label: "Arrived" } }))).toBe("ready")
    expect(sectionFor(state({ waiting_on: "customer", next_action: { kind: "wait_proof", label: "Proof sent" } }))).toBe("waiting_on_customer")
    expect(sectionFor(state({ waiting_on: null, next_action: { kind: "none", label: "Delivered" } }))).toBeNull()
    expect(sectionFor(state({ lost: true }))).toBeNull()
  })
})

describe("groupToday", () => {
  it("orders each section longest wait first, flags breaking ties, and counts", () => {
    const view = groupToday(
      [
        job("a", { days: 1 }),
        job("b", { days: 5 }),
        job("c", { days: 5 }, [{ kind: "no_order", label: "no order" }]),
        job("d", { waiting_on: "customer", next_action: { kind: "nudge_quote", label: "Nudge" }, days: 2 }),
        job("e", { lost: true }),
      ],
      new Date("2026-10-21T00:00:00.000Z")
    )
    expect(view.sections.waiting_on_us.map((r) => r.id)).toEqual(["c", "b", "a"])
    expect(view.sections.waiting_on_customer.map((r) => r.id)).toEqual(["d"])
    expect(view.counts).toEqual({ waiting_on_us: 3, ready: 0, waiting_on_customer: 1, total: 4 })
    expect(view.sections.waiting_on_us[0]).toMatchObject({ label: "Q-C", customer: "Dean", total: 148, last_activity: { kind: "email_in" } })
  })

  it("puts rushed jobs first, Express before Priority, whatever the wait", () => {
    const rushed = (id: string, tier: "priority" | "express") => {
      const j = job(id, { days: 0 })
      return { ...j, order: { rush_tier: tier } as JobView["order"] } as JobView
    }
    const view = groupToday([job("a", { days: 9 }), rushed("p", "priority"), rushed("x", "express")], new Date("2026-10-21T00:00:00.000Z"))
    expect(view.sections.waiting_on_us.map((r) => r.id)).toEqual(["x", "p", "a"])
    expect(view.sections.waiting_on_us[0].rush_tier).toBe("express")
  })
})
