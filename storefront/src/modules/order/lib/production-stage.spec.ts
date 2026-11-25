import { currentCustomerMilestone, readProductionStageMetadata } from "./production-stage"

const now = (meta: Record<string, unknown>) => {
  const t = readProductionStageMetadata(meta)
  return currentCustomerMilestone({ ...t, stage: t.stage! })
}

describe("currentCustomerMilestone", () => {
  it("is 'received' until artwork or blanks move", () => {
    expect(now({ production_stage: "received", artwork_stage: "pending", blanks_stage: "not_started" })).toBe("received")
  })

  it("is 'preparing' through artwork approval while production_stage is still 'received'", () => {
    expect(now({ production_stage: "received", artwork_stage: "awaiting_approval" })).toBe("preparing")
    expect(now({ production_stage: "received", artwork_stage: "approved", blanks_stage: "ordered" })).toBe("preparing")
  })

  it("follows the production track once printing starts", () => {
    expect(now({ production_stage: "in_production", artwork_stage: "approved", blanks_stage: "arrived" })).toBe("production")
    expect(now({ production_stage: "shipped", artwork_stage: "approved" })).toBe("shipped")
  })
})
