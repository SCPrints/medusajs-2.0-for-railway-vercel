import { isComplete, isValidKey, lineKey, orderKey, requiredKeys } from "../packing-check"

describe("packing-check", () => {
  const lines = ["li_1", "li_2"]
  const tick = { at: "2026-10-15T00:00:00Z", by: "Sam" }

  it("requires every line check plus every box check", () => {
    expect(requiredKeys(lines)).toHaveLength(2 * 3 + 4)
  })

  it("rejects keys for unknown lines or checks", () => {
    expect(isValidKey(lineKey("li_1", "quality"), lines)).toBe(true)
    expect(isValidKey(lineKey("li_9", "quality"), lines)).toBe(false)
    expect(isValidKey(orderKey("nope"), lines)).toBe(false)
  })

  it("is complete only when all required keys are ticked", () => {
    const ticks = Object.fromEntries(requiredKeys(lines).map((k) => [k, tick]))
    expect(isComplete({ ticks }, lines)).toBe(true)
    delete ticks[orderKey("sealed")]
    expect(isComplete({ ticks }, lines)).toBe(false)
    expect(isComplete({ ticks: {} }, [])).toBe(false)
  })
})
