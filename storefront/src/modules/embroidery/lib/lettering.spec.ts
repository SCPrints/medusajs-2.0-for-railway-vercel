import { calculateLetteringStitches } from "./lettering"

describe("calculateLetteringStitches", () => {
  it("returns 0 for empty text", () => {
    expect(
      calculateLetteringStitches({
        text: "",
        font: "block",
        heightMm: 25,
        archMode: "straight",
      })
    ).toBe(0)
  })

  it("scales roughly with letter area at the reference height", () => {
    const stitches = calculateLetteringStitches({
      text: "ABCD",
      font: "block",
      heightMm: 25,
      archMode: "straight",
    })
    // 4 chars × 110 base × 1.0 size mult × 1.0 arch mult
    expect(stitches).toBe(440)
  })

  it("applies arch overhead on curved layouts", () => {
    const straight = calculateLetteringStitches({
      text: "ABCD",
      font: "block",
      heightMm: 25,
      archMode: "straight",
    })
    const arched = calculateLetteringStitches({
      text: "ABCD",
      font: "block",
      heightMm: 25,
      archMode: "arch_up",
    })
    expect(arched).toBeGreaterThan(straight)
  })

  it("ignores whitespace in character count", () => {
    const withSpaces = calculateLetteringStitches({
      text: "A B C",
      font: "block",
      heightMm: 25,
      archMode: "straight",
    })
    const withoutSpaces = calculateLetteringStitches({
      text: "ABC",
      font: "block",
      heightMm: 25,
      archMode: "straight",
    })
    expect(withSpaces).toBe(withoutSpaces)
  })
})
