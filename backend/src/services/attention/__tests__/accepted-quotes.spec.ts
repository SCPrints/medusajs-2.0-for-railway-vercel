import { selectAcceptedWithoutOrder } from "../accepted-quotes"

// Fri 16 Oct 2026 12:46 Sydney = 01:46Z; Mon 19 Oct 09:00 Sydney = Sun 22:00Z.
const ACCEPTED = "2026-10-16T01:46:00.000Z"
const MONDAY = new Date("2026-10-18T22:00:00.000Z")
const SAME_DAY = new Date("2026-10-16T05:00:00.000Z")

describe("selectAcceptedWithoutOrder", () => {
  it("flags an accepted quote with no order after a business day (Dean's case)", () => {
    expect(
      selectAcceptedWithoutOrder(
        [{ id: "q1", status: "accepted", accepted_at: ACCEPTED, metadata: {} }],
        MONDAY
      )
    ).toEqual(["q1"])
  })

  it("leaves alone: same day, converted, already flagged, not accepted", () => {
    const rows = [
      { id: "fresh", status: "accepted", accepted_at: ACCEPTED, metadata: {} },
      { id: "converted", status: "accepted", accepted_at: ACCEPTED, metadata: { order_id: "order_1" } },
      { id: "flagged", status: "accepted", accepted_at: ACCEPTED, metadata: { accepted_no_order_flagged_at: "x" } },
      { id: "quoted", status: "quoted", accepted_at: null, metadata: {} },
    ]
    expect(selectAcceptedWithoutOrder(rows, SAME_DAY)).toEqual([])
    expect(selectAcceptedWithoutOrder(rows, MONDAY)).toEqual(["fresh"])
  })
})
