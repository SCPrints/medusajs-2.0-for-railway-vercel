import {
  planProductionStageChange,
  ARTWORK_STAGE_EVENT,
  PRODUCTION_STAGE_EVENT,
  type ProductionStageChangeInput,
} from "../production-stage"

const OPTS = {
  orderId: "order_1",
  changedAt: "2026-06-01T00:00:00.000Z",
  changedBy: "automation",
}

const plan = (meta: Record<string, unknown>, input: ProductionStageChangeInput) =>
  planProductionStageChange(meta, input, OPTS)

describe("planProductionStageChange", () => {
  it("routes a legacy artwork stage to the artwork track + event (the regression)", () => {
    // The bug: setting an artwork-track stage (e.g. awaiting_approval) wrote
    // production_stage + emitted the generic PRODUCTION_STAGE_EVENT, so the
    // artwork-approval email subscriber (listens on ARTWORK_STAGE_EVENT)
    // never fired and the track fields drifted.
    const result = plan({ production_stage: "received" }, { stage: "awaiting_approval" })
    expect(result.changed).toBe(true)
    expect(result.metadata?.artwork_stage).toBe("awaiting_approval")
    expect(result.events.map((e) => e.name)).toEqual([ARTWORK_STAGE_EVENT])
    expect(result.events[0].data).toMatchObject({
      order_id: "order_1",
      to_stage: "awaiting_approval",
      track: "artwork",
      changed_by: "automation",
    })
  })

  it("routes a downstream stage to the production track + generic event", () => {
    const result = plan({ production_stage: "received" }, { stage: "in_production" })
    expect(result.changed).toBe(true)
    expect(result.metadata?.production_stage).toBe("in_production")
    expect(result.events.map((e) => e.name)).toEqual([PRODUCTION_STAGE_EVENT])
  })

  it("is a no-op when the target stage matches the current track", () => {
    const result = plan({ production_stage: "in_production" }, { stage: "in_production" })
    expect(result.changed).toBe(false)
    expect(result.metadata).toBeNull()
    expect(result.events).toEqual([])
  })

  it("appends to existing history rather than replacing it", () => {
    const result = plan(
      {
        production_stage: "received",
        production_stage_history: [
          { stage: "received", changed_at: "2026-05-01T00:00:00.000Z" },
        ],
      },
      { stage: "in_production" }
    )
    expect(result.metadata?.production_stage_history).toHaveLength(2)
    expect(result.metadata?.production_stage_history?.[1]).toMatchObject({
      stage: "in_production",
      changed_by: "automation",
      track: "production",
    })
  })
})
