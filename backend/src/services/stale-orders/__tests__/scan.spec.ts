import { findStuckTrack, planStaleUpdate } from "../scan"

// 2026-10-12 is a Monday; 00:00Z is 11:00 in Sydney.
const MON = "2026-10-12T00:00:00.000Z"
const at = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)

describe("findStuckTrack", () => {
  it("flags a proof unanswered for 4 business days", () => {
    const stuck = findStuckTrack(
      { artwork_stage: "awaiting_approval", artwork_stage_changed_at: MON, production_stage: "received" },
      at("2026-10-16")
    )
    expect(stuck).toMatchObject({ track: "artwork", stage: "awaiting_approval", days: 4, limit: 4 })
  })

  it("does not flag the same proof after 3 business days, even with the received limit at 3", () => {
    expect(
      findStuckTrack(
        { artwork_stage: "awaiting_approval", artwork_stage_changed_at: MON, production_stage: "received" },
        at("2026-10-15"),
        3
      )
    ).toBeNull()
  })

  it("flags blanks ordered 5 business days ago", () => {
    expect(
      findStuckTrack(
        {
          artwork_stage: "approved",
          blanks_stage: "ordered",
          blanks_stage_changed_at: MON,
          production_stage: "received",
        },
        at("2026-10-19"),
        99
      )
    ).toMatchObject({ track: "blanks", stage: "ordered", days: 5 })
  })

  it("uses the production track's own history date, not the last change on any track", () => {
    const stuck = findStuckTrack(
      {
        artwork_stage: "approved",
        blanks_stage: "arrived",
        production_stage: "in_production",
        // A later artwork edit bumped the shared timestamp…
        production_stage_changed_at: "2026-10-14T00:00:00.000Z",
        production_stage_history: [
          { stage: "in_production", changed_at: MON, track: "production" },
          { stage: "approved", changed_at: "2026-10-14T00:00:00.000Z", track: "artwork" },
        ],
      },
      at("2026-10-15")
    )
    // …but production has been in_production since Monday.
    expect(stuck).toMatchObject({ track: "production", stage: "in_production", days: 3 })
  })

  it("flags an untouched order sitting at received", () => {
    expect(
      findStuckTrack(
        { production_stage: "received", production_stage_changed_at: MON },
        at("2026-10-15"),
        3
      )
    ).toMatchObject({ track: "production", stage: "received", days: 3 })
  })

  it("leaves artwork pending and blanks not started alone", () => {
    expect(
      findStuckTrack(
        {
          artwork_stage: "pending",
          artwork_stage_changed_at: MON,
          blanks_stage: "not_started",
          blanks_stage_changed_at: MON,
          production_stage: "received",
          production_stage_changed_at: at("2026-10-29").toISOString(),
        },
        at("2026-10-29"),
        3
      )
    ).toBeNull()
  })
})

describe("planStaleUpdate", () => {
  const stuckMeta = {
    artwork_stage: "awaiting_approval",
    artwork_stage_changed_at: MON,
    production_stage: "received",
  }
  const fri = at("2026-10-16")

  it("flags and notifies the first time", () => {
    const plan = planStaleUpdate(stuckMeta, fri, { receivedLimit: 99 })
    expect(plan.notify).toBe(true)
    expect(plan.metadata).toMatchObject({
      is_stale: true,
      stale_stage: "awaiting_approval",
      stale_track: "artwork",
      stale_notified_key: `artwork:awaiting_approval:${MON}`,
    })
  })

  it("does not notify again for the same stay, even after staff cleared the badge", () => {
    const plan = planStaleUpdate(
      { ...stuckMeta, stale_notified_key: `artwork:awaiting_approval:${MON}` },
      fri,
      { receivedLimit: 99 }
    )
    expect(plan.notify).toBe(false)
    expect(plan.metadata?.is_stale).toBe(true)
  })

  it("clears the flag once the order moves", () => {
    const plan = planStaleUpdate(
      {
        artwork_stage: "approved",
        artwork_stage_changed_at: "2026-10-16T00:00:00.000Z",
        production_stage: "received",
        is_stale: true,
        stale_stage: "awaiting_approval",
      },
      fri,
      { receivedLimit: 99 }
    )
    expect(plan.stuck).toBeNull()
    expect(plan.metadata).not.toHaveProperty("is_stale")
    expect(plan.metadata).not.toHaveProperty("stale_stage")
  })

  it.each(["shipped", "delivered"])("releases a flag carried into %s", (stage) => {
    const plan = planStaleUpdate({ ...stuckMeta, production_stage: stage, is_stale: true }, fri)
    expect(plan.stuck).toBeNull()
    expect(plan.metadata).not.toHaveProperty("is_stale")
  })

  it("never flags a cancelled or refunded order", () => {
    expect(planStaleUpdate(stuckMeta, fri, { notProceeding: true })).toEqual({
      stuck: null,
      metadata: null,
      notify: false,
    })
  })

  it("writes nothing when an unflagged order is fine", () => {
    expect(planStaleUpdate({ production_stage: "received" }, fri).metadata).toBeNull()
  })
})
