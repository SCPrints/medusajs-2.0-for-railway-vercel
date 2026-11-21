import { MAX_PROOF_PINS, cleanProofPins } from "../proof-pins"

describe("cleanProofPins", () => {
  it("clamps, trims and drops junk", () => {
    const out = cleanProofPins([
      { image_index: 0, x: 1.5, y: -2, note: "  move left  " },
      { image_index: -1, x: 0.5, y: 0.5, note: "bad index" },
      { image_index: 1, x: "a", y: 0.1, note: "bad x" },
      null,
    ])
    expect(out).toEqual([{ image_index: 0, x: 1, y: 0, note: "move left" }])
  })
  it("caps the count and note length", () => {
    const many = Array.from({ length: 30 }, () => ({ image_index: 0, x: 0.1, y: 0.1, note: "x".repeat(500) }))
    const out = cleanProofPins(many)
    expect(out).toHaveLength(MAX_PROOF_PINS)
    expect(out[0].note).toHaveLength(300)
    expect(cleanProofPins("nope")).toEqual([])
  })
})
