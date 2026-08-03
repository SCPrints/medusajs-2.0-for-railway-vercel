import { decideStaleAction } from "../scan"

const DAY = 24 * 60 * 60 * 1000
const threshold = 3 * DAY

describe("decideStaleAction", () => {
  it("flags an in-flight order that has sat past the threshold", () => {
    expect(
      decideStaleAction({
        stage: "in_production",
        flagged: false,
        ageMs: 5 * DAY,
        thresholdMs: threshold,
      })
    ).toBe("flag")
  })

  it("leaves an already-flagged in-flight order alone", () => {
    expect(
      decideStaleAction({
        stage: "in_production",
        flagged: true,
        ageMs: 5 * DAY,
        thresholdMs: threshold,
      })
    ).toBe("none")
  })

  it("clears the flag once an order moves again", () => {
    expect(
      decideStaleAction({
        stage: "in_production",
        flagged: true,
        ageMs: 1 * DAY,
        thresholdMs: threshold,
      })
    ).toBe("clear")
  })

  // The 2026-08 bug: order flagged stale at an earlier stage, then advanced
  // to delivered. The old code `continue`d on terminal stages before the
  // clear branch, so the badge stuck forever.
  it.each(["shipped", "delivered"])(
    "clears a flag carried into the terminal stage %s",
    (stage) => {
      expect(
        decideStaleAction({
          stage,
          flagged: true,
          ageMs: 40 * DAY,
          thresholdMs: threshold,
        })
      ).toBe("clear")
    }
  )

  it.each(["shipped", "delivered"])("never flags terminal stage %s", (stage) => {
    expect(
      decideStaleAction({
        stage,
        flagged: false,
        ageMs: 40 * DAY,
        thresholdMs: threshold,
      })
    ).toBe("none")
  })

  it("does nothing without a stage or a parseable change date", () => {
    expect(
      decideStaleAction({
        stage: null,
        flagged: true,
        ageMs: 40 * DAY,
        thresholdMs: threshold,
      })
    ).toBe("none")
    expect(
      decideStaleAction({
        stage: "in_production",
        flagged: false,
        ageMs: null,
        thresholdMs: threshold,
      })
    ).toBe("none")
  })
})
