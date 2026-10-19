import { stageAuditDetails } from "../stage-audit-details"

describe("stageAuditDetails", () => {
  it("carries the event's track and transition", () => {
    expect(
      stageAuditDetails(
        {
          order_id: "order_1",
          from_stage: "in_review",
          to_stage: "awaiting_approval",
          changed_at: "2026-10-19T00:00:00.000Z",
          changed_by: "user_1",
          note: "proof v2",
          track: "artwork",
        },
        "production"
      )
    ).toEqual({
      track: "artwork",
      from_stage: "in_review",
      to_stage: "awaiting_approval",
      note: "proof v2",
      changed_at: "2026-10-19T00:00:00.000Z",
    })
  })

  it("falls back to the subscribed event's track and nulls missing fields", () => {
    expect(
      stageAuditDetails(
        { order_id: "order_1", from_stage: null, to_stage: "arrived", changed_at: "t" },
        "blanks"
      )
    ).toEqual({ track: "blanks", from_stage: null, to_stage: "arrived", note: null, changed_at: "t" })
  })
})
