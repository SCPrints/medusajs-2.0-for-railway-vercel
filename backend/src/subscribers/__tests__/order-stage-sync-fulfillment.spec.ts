import { toNum } from "../order-stage-sync-fulfillment"

describe("toNum", () => {
  it("passes plain numbers through", () => {
    expect(toNum(3)).toBe(3)
    expect(toNum(0)).toBe(0)
  })

  // query.graph returns quantities undecorated — a raw BigNumber-ish
  // object rather than the number retrieveOrder would hand back.
  it("unwraps raw BigNumber-ish values", () => {
    expect(toNum({ value: "2" })).toBe(2)
    expect(toNum({ value: 5 })).toBe(5)
  })

  it("parses numeric strings", () => {
    expect(toNum("4")).toBe(4)
  })

  it("falls back when there is no usable number", () => {
    expect(toNum(undefined)).toBe(0)
    expect(toNum(null)).toBe(0)
    expect(toNum({})).toBe(0)
    expect(toNum("abc", 1)).toBe(1)
    expect(toNum(NaN, 1)).toBe(1)
    expect(toNum(undefined, 1)).toBe(1)
  })
})
