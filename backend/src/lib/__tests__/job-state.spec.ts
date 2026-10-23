import { deriveJobState, STAFF_NOTE_ACTOR_PREFIX, threadTimes, type JobSnapshot } from "../job-state"

// Wed 21 Oct 2026 09:00 Sydney.
const NOW = new Date("2026-10-20T22:00:00.000Z")

const quote = (over: Partial<NonNullable<JobSnapshot["quote"]>> = {}): NonNullable<JobSnapshot["quote"]> => ({
  status: "quoted",
  created_at: "2026-10-15T00:00:00.000Z",
  quoted_at: "2026-10-16T00:17:00.000Z",
  accepted_at: null,
  has_prices: true,
  design_changes_requested_at: null,
  design_approved_at: null,
  ...over,
})

const order = (over: Partial<NonNullable<JobSnapshot["order"]>> = {}): NonNullable<JobSnapshot["order"]> => ({
  created_at: "2026-10-20T00:00:00.000Z",
  status: "pending",
  paid: false,
  deposit_required: false,
  deposit_paid: false,
  has_open_payment_link: false,
  tracks: { artwork: "pending", blanks: "not_started", downstream: "received" },
  artwork_stage_changed_at: null,
  artwork_changes_requested_at: null,
  blanks_stage_changed_at: null,
  production_stage_changed_at: null,
  has_decorated_lines: true,
  gate_failures: [],
  ...over,
})

const base = (over: Partial<JobSnapshot>): JobSnapshot => ({
  quote: null,
  order: null,
  last_inbound_at: null,
  last_outbound_at: null,
  now: NOW,
  ...over,
})

describe("deriveJobState", () => {
  it("Dean: accepted, no order, emailed twice → waiting on us, Convert to order", () => {
    const st = deriveJobState(
      base({
        quote: quote({ status: "accepted", accepted_at: "2026-10-16T01:46:00.000Z" }),
        last_inbound_at: "2026-10-16T02:15:00.000Z",
        last_outbound_at: "2026-10-16T02:07:00.000Z",
      })
    )
    expect(st.phase).toBe("accepted")
    expect(st.waiting_on).toBe("us")
    // The unanswered email wins over the conversion.
    expect(st.next_action.kind).toBe("reply")
    expect(st.days).toBe(3)
  })

  it("accepted and replied to → Convert to order", () => {
    const st = deriveJobState(
      base({
        quote: quote({ status: "accepted", accepted_at: "2026-10-16T01:46:00.000Z" }),
        last_inbound_at: "2026-10-16T02:15:00.000Z",
        last_outbound_at: "2026-10-16T03:00:00.000Z",
      })
    )
    expect(st.next_action.kind).toBe("convert_to_order")
    expect(st.since).toBe("2026-10-16T01:46:00.000Z")
  })

  it("new enquiry → Price it; quoted → waiting on customer with a nudge countdown", () => {
    expect(deriveJobState(base({ quote: quote({ status: "new", quoted_at: null }) })).next_action.kind).toBe("price_it")
    const sent = deriveJobState(base({ quote: quote({ quoted_at: "2026-10-20T00:00:00.000Z" }) }))
    expect(sent.waiting_on).toBe("customer")
    expect(sent.next_action).toMatchObject({ kind: "nudge_quote", label: "Nudge in 1d" })
    expect(deriveJobState(base({ quote: quote() })).next_action.label).toBe("Nudge")
  })

  it("order unpaid → Send payment link, then nudge once a link is out", () => {
    expect(deriveJobState(base({ order: order() })).next_action.kind).toBe("send_payment_link")
    const st = deriveJobState(base({ order: order({ has_open_payment_link: true }) }))
    expect(st).toMatchObject({ phase: "accepted", waiting_on: "customer", next_action: { kind: "nudge_payment" } })
  })

  it("paid → Send proof → waiting on proof → approved → Order blanks → supplier → Start production", () => {
    const paid = order({ paid: true })
    expect(deriveJobState(base({ order: paid })).next_action.kind).toBe("send_proof")
    expect(
      deriveJobState(base({ order: { ...paid, tracks: { artwork: "awaiting_approval", blanks: "not_started", downstream: "received" } } }))
    ).toMatchObject({ waiting_on: "customer", next_action: { kind: "wait_proof" } })
    const approved = { ...paid, tracks: { artwork: "approved" as const, blanks: "not_started" as const, downstream: "received" as const } }
    expect(deriveJobState(base({ order: approved }))).toMatchObject({ phase: "artwork", next_action: { kind: "order_blanks" } })
    expect(
      deriveJobState(base({ order: { ...approved, tracks: { ...approved.tracks, blanks: "ordered" } } }))
    ).toMatchObject({ waiting_on: "supplier", next_action: { kind: "mark_arrived" } })
    const ready = deriveJobState(base({ order: { ...approved, tracks: { ...approved.tracks, blanks: "arrived" } } }))
    expect(ready).toMatchObject({ phase: "blanks", waiting_on: "us", next_action: { kind: "start_production" } })
  })

  it("changes requested on the proof beats everything but a reply", () => {
    const st = deriveJobState(
      base({
        order: order({
          paid: true,
          tracks: { artwork: "in_review", blanks: "not_started", downstream: "received" },
          artwork_stage_changed_at: "2026-10-19T00:00:00.000Z",
          artwork_changes_requested_at: "2026-10-19T00:00:00.000Z",
        }),
      })
    )
    expect(st.next_action.kind).toBe("revise_proof")
  })

  it("in production → QC done; QC → Mark shipped; shipped/delivered → nothing", () => {
    const mk = (downstream: any) =>
      deriveJobState(base({ order: order({ paid: true, tracks: { artwork: "approved", blanks: "arrived", downstream } }) }))
    expect(mk("in_production").next_action.kind).toBe("qc_done")
    expect(mk("quality_check").next_action.kind).toBe("mark_shipped")
    expect(mk("shipped")).toMatchObject({ phase: "shipped", waiting_on: null, next_action: { kind: "none" } })
    expect(mk("delivered").phase).toBe("delivered")
  })

  it("a stock-only order skips artwork and blanks", () => {
    const st = deriveJobState(base({ order: order({ paid: true, has_decorated_lines: false }) }))
    expect(st.next_action.kind).toBe("start_production")
  })

  it("lost quotes and cancelled orders are closed", () => {
    expect(deriveJobState(base({ quote: quote({ status: "lost" }) })).lost).toBe(true)
    expect(deriveJobState(base({ order: order({ status: "canceled" }) })).next_action.kind).toBe("none")
  })

  // ── Step 0 fixes (Docs/ADMIN_JOB_WINDOW_2026_10.md) ─────────────────────

  it("a customer on account terms goes straight to proof; the strip doesn't call it Paid", () => {
    const st = deriveJobState(base({ order: order({ balance_due_at: "2026-11-20T00:00:00.000Z" }) }))
    expect(st.next_action.kind).toBe("send_proof")
    expect(st.steps.find((s) => s.key === "paid")?.done).toBe(false)
  })

  it("a deposit is still enforced for a terms customer", () => {
    const st = deriveJobState(base({ order: order({ balance_due_at: "2026-11-20T00:00:00.000Z", deposit_required: true }) }))
    expect(st.next_action.kind).toBe("send_payment_link")
  })

  it("shipped or delivered with money owing → Chase balance, overdue once past due", () => {
    const done = { artwork: "approved" as const, blanks: "arrived" as const, downstream: "delivered" as const }
    const owing = deriveJobState(base({ order: order({ tracks: done, outstanding: 412, production_stage_changed_at: "2026-10-09T00:00:00.000Z" }) }))
    expect(owing).toMatchObject({ waiting_on: "customer", next_action: { kind: "nudge_payment", label: "Chase balance" } })
    const overdue = deriveJobState(base({ order: order({ tracks: done, outstanding: 412, balance_due_at: "2026-10-15T00:00:00.000Z" }) }))
    expect(overdue.next_action.label).toBe("Chase balance (overdue)")
    expect(overdue.since).toBe("2026-10-15T00:00:00.000Z")
    expect(deriveJobState(base({ order: order({ tracks: done, paid: true, outstanding: 0 }) })).next_action.kind).toBe("none")
  })

  it("a customer email on a delivered job that still owes → Reply first", () => {
    const st = deriveJobState(
      base({
        order: order({ tracks: { artwork: "approved", blanks: "arrived", downstream: "delivered" }, outstanding: 50 }),
        last_inbound_at: "2026-10-20T01:00:00.000Z",
        last_outbound_at: "2026-10-19T01:00:00.000Z",
      })
    )
    expect(st.next_action.kind).toBe("reply")
  })

  it("once a revised proof exists after the change request → Send revised proof", () => {
    const changed = {
      paid: true,
      tracks: { artwork: "in_review" as const, blanks: "not_started" as const, downstream: "received" as const },
      artwork_stage_changed_at: "2026-10-19T00:00:00.000Z",
      artwork_changes_requested_at: "2026-10-19T00:00:00.000Z",
    }
    expect(deriveJobState(base({ order: order({ ...changed, revised_proof_at: "2026-10-18T00:00:00.000Z" }) })).next_action.kind).toBe("revise_proof")
    expect(deriveJobState(base({ order: order({ ...changed, revised_proof_at: "2026-10-20T00:00:00.000Z" }) })).next_action).toMatchObject({
      kind: "send_proof",
      label: "Send revised proof",
    })
  })

  it("a walk-in stock sale → Collected; a decorated POS job still goes through production", () => {
    expect(deriveJobState(base({ order: order({ paid: true, pos_sale: true, has_decorated_lines: false }) })).next_action.kind).toBe("collected")
    expect(deriveJobState(base({ order: order({ paid: true, pos_sale: true }) })).next_action.kind).toBe("send_proof")
  })
})

describe("follow-up dates", () => {
  const waitingOnCustomer = base({ quote: quote() }) // quoted 16 Oct → Nudge

  it("a future follow-up parks the nudge and sorts the job last", () => {
    const st = deriveJobState({ ...waitingOnCustomer, follow_up_at: "2026-11-04T14:00:00.000Z" })
    expect(st).toMatchObject({ waiting_on: "customer", days: 0, since: null, next_action: { kind: "nudge_quote" } })
    expect(st.next_action.label).toMatch(/^Follow up /)
  })

  it("on the day it becomes ours to chase", () => {
    const st = deriveJobState({ ...waitingOnCustomer, follow_up_at: "2026-10-19T14:00:00.000Z" })
    expect(st).toMatchObject({ waiting_on: "us", next_action: { kind: "follow_up", label: "Follow up" } })
  })

  it("doesn't touch a job that's waiting on us", () => {
    const st = deriveJobState(base({ quote: quote({ status: "new", quoted_at: null }), follow_up_at: "2026-10-19T14:00:00.000Z" }))
    expect(st.next_action.kind).toBe("price_it")
  })
})

describe("threadTimes", () => {
  const feed = [
    { kind: "email_in", at: "2026-10-20T01:00:00.000Z", actor: "email:dean@x.au" },
    { kind: "comment", at: "2026-10-20T02:00:00.000Z", actor: "user_01" }, // DSP send / internal comment
    { kind: "note", at: "2026-10-20T03:00:00.000Z", actor: "user_01" }, // drawer note, not from the composer
  ]

  it("a DSP email or an internal note doesn't answer the customer", () => {
    const t = threadTimes(feed)
    expect(t.last_inbound_at).toBe("2026-10-20T01:00:00.000Z")
    expect(t.answers).toEqual([])
    const st = deriveJobState(base({ order: order({ paid: true }), last_inbound_at: t.last_inbound_at, last_outbound_at: t.answers.sort().at(-1) ?? null }))
    expect(st.next_action.kind).toBe("reply")
  })

  it("a call logged from the composer does", () => {
    const t = threadTimes([...feed, { kind: "note", at: "2026-10-20T04:00:00.000Z", actor: `${STAFF_NOTE_ACTOR_PREFIX}user_01` }])
    expect(t.answers).toEqual(["2026-10-20T04:00:00.000Z"])
    const st = deriveJobState(base({ order: order({ paid: true }), last_inbound_at: t.last_inbound_at, last_outbound_at: t.answers.at(-1) ?? null }))
    expect(st.next_action.kind).toBe("send_proof")
  })
})
