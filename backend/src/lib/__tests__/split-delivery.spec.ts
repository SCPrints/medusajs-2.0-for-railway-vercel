import { cleanSplitInput, validateSplit } from "../split-delivery"

const lines = [{ id: "li_1", quantity: 10 }, { id: "li_2", quantity: 4 }]
const ok = new Set(["d1", "d2"])

describe("split delivery", () => {
  it("cleans junk", () => {
    expect(cleanSplitInput("x")).toBeNull()
    expect(cleanSplitInput([{ destination_id: "d1", lines: [{ line_id: "li_1", quantity: 0 }] }])).toBeNull()
  })
  it("accepts an exact split", () => {
    const s = cleanSplitInput([
      { destination_id: "d1", lines: [{ line_id: "li_1", quantity: 6 }, { line_id: "li_2", quantity: 4 }] },
      { destination_id: "d2", lines: [{ line_id: "li_1", quantity: 4 }] },
    ])!
    expect(validateSplit(s, lines, ok)).toBeNull()
  })
  it("refuses short, long, one address, foreign or duplicate", () => {
    const split = (a: number, b: number) => [
      { destination_id: "d1", lines: [{ line_id: "li_1", quantity: a }, { line_id: "li_2", quantity: 4 }] },
      { destination_id: "d2", lines: [{ line_id: "li_1", quantity: b }] },
    ]
    expect(validateSplit(split(6, 3), lines, ok)).toMatch(/add up/)
    expect(validateSplit(split(6, 5), lines, ok)).toMatch(/add up/)
    expect(validateSplit(split(6, 4).slice(0, 1), lines, ok)).toMatch(/at least two/)
    expect(validateSplit(split(6, 4), lines, new Set(["d1"]))).toMatch(/isn't saved/)
    const dup = split(6, 4)
    dup[1].destination_id = "d1"
    expect(validateSplit(dup, lines, ok)).toMatch(/once/)
    expect(validateSplit(split(6, 4), [{ id: "other", quantity: 10 }], ok)).toMatch(/changed/)
  })
})
