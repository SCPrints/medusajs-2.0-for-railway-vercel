import { needsProofReminder } from "../proof-reminders"

// 2026-10-12 is a Monday.
const sentMon = "2026-10-12T00:00:00.000Z" // 11:00 Mon in Sydney
const wed = new Date("2026-10-14T00:00:00.000Z")
const tue = new Date("2026-10-13T00:00:00.000Z")

const awaiting = (extra: Record<string, unknown> = {}) => ({
  artwork_stage: "awaiting_approval",
  artwork_stage_changed_at: sentMon,
  ...extra,
})

describe("needsProofReminder", () => {
  it("reminds once 2 business days have passed", () => {
    expect(needsProofReminder(awaiting(), wed, 2)).toBe(true)
  })

  it("waits until then", () => {
    expect(needsProofReminder(awaiting(), tue, 2)).toBe(false)
  })

  it("reminds only once per proof round", () => {
    expect(
      needsProofReminder(awaiting({ artwork_proof_reminder_sent_at: wed.toISOString() }), wed, 2)
    ).toBe(false)
  })

  it("reminds again after a new proof is sent", () => {
    const resent = "2026-10-15T00:00:00.000Z"
    expect(
      needsProofReminder(
        awaiting({
          artwork_stage_changed_at: resent,
          artwork_proof_reminder_sent_at: wed.toISOString(),
        }),
        new Date("2026-10-19T00:00:00.000Z"),
        2
      )
    ).toBe(true)
  })

  it.each(["pending", "in_review", "approved"])("ignores artwork that is %s", (stage) => {
    expect(needsProofReminder(awaiting({ artwork_stage: stage }), wed, 2)).toBe(false)
  })
})
