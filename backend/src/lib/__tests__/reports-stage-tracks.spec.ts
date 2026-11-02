import {
  computeStageDwellDays,
  currentTrackStages,
  isCheckoutOrder,
  isOpenUnshipped,
  projectedShipDate,
  stageTransitions,
  workDaysToShip,
} from "../reports/orders"

const day = (n: number) => new Date(Date.UTC(2026, 9, n)).toISOString()
const order = (history: Array<[string, number]>, meta: Record<string, unknown> = {}) => ({
  metadata: {
    production_stage_history: history.map(([stage, d]) => ({ stage, changed_at: day(d) })),
    ...meta,
  },
})

describe("stage history per track", () => {
  // received sits on production while artwork and blanks move in between.
  const o = order([
    ["received", 1],
    ["in_review", 2],
    ["ordered", 3],
    ["awaiting_approval", 4],
    ["arrived", 5],
    ["approved", 6],
    ["in_production", 8],
  ])

  it("measures a stage against the next move on its own track", () => {
    expect(computeStageDwellDays(o).map((d) => [d.stage, d.days])).toEqual([
      ["in_review", 2],
      ["ordered", 2],
      ["awaiting_approval", 2],
      ["received", 7],
    ])
  })

  it("doesn't treat a forward move across tracks as a rollback", () => {
    expect(stageTransitions(o).some((t) => t.rollback)).toBe(false)
  })

  it("flags a backwards move within one track", () => {
    const rollbacks = stageTransitions(
      order([
        ["received", 1],
        ["in_production", 2],
        ["quality_check", 3],
        ["pending", 4],
        ["in_production", 5],
      ])
    ).filter((t) => t.rollback)
    expect(rollbacks.map((t) => [t.from_stage, t.to_stage])).toEqual([
      ["quality_check", "in_production"],
    ])
  })

  it("leaves track end stages out of dwell", () => {
    const stages = computeStageDwellDays(
      order([
        ["awaiting_approval", 1],
        ["approved", 2],
        ["awaiting_approval", 3],
      ])
    ).map((d) => d.stage)
    expect(stages).toEqual(["awaiting_approval"])
  })

  it("reports where each track is now", () => {
    expect(currentTrackStages(o).map((c) => c.stage).sort()).toEqual([
      "approved",
      "arrived",
      "in_production",
    ])
  })
})

describe("shipping forecast", () => {
  const now = Date.parse("2026-11-02T00:00:00Z")

  it("counts only orders production hasn't shipped", () => {
    expect(isOpenUnshipped({ metadata: { production_stage: "in_production" } })).toBe(true)
    expect(isOpenUnshipped({ metadata: { production_stage: "shipped" } })).toBe(false)
    expect(isOpenUnshipped({ metadata: { production_stage: "delivered" } })).toBe(false)
    expect(isOpenUnshipped({ status: "canceled", metadata: { production_stage: "received" } })).toBe(false)
    expect(
      isOpenUnshipped({
        metadata: { production_stage: "received" },
        summary: { paid_total: 100, refunded_total: 100 },
      })
    ).toBe(false)
  })

  it("leaves transit time out of the work left", () => {
    // received 1 + in_production 3 + quality_check 1, no time spent yet.
    expect(workDaysToShip({ metadata: { production_stage: "received" } }, now)).toBe(5)
  })

  it("prefers the due date over the estimate", () => {
    expect(
      projectedShipDate(
        { metadata: { production_stage: "received", production_due_date: "2026-11-04" } },
        now
      )
    ).toBe("2026-11-04")
    expect(projectedShipDate({ metadata: { production_stage: "received" } }, now)).toBe("2026-11-07")
  })
})

describe("isCheckoutOrder", () => {
  it("is false for quote conversions", () => {
    expect(isCheckoutOrder({ metadata: { quote_id: "q_1" } })).toBe(false)
    expect(isCheckoutOrder({ metadata: {} })).toBe(true)
    expect(isCheckoutOrder({})).toBe(true)
  })
})
