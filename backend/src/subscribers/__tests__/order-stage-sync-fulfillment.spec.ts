import { pickBestLocation, toNum } from "../order-stage-sync-fulfillment"

describe("pickBestLocation", () => {
  it("returns undefined when there is nothing to pick", () => {
    expect(pickBestLocation([])).toBeUndefined()
    expect(pickBestLocation([{ location_id: null }])).toBeUndefined()
  })

  it("picks the location covering the most items", () => {
    expect(
      pickBestLocation([
        { location_id: "sloc_au" },
        { location_id: "sloc_ascolour" },
        { location_id: "sloc_ascolour" },
      ])
    ).toBe("sloc_ascolour")
  })

  // Order #41: the only level is at the supplier warehouse, and its
  // reservations were released when AS Colour shipped it.
  it("picks the single supplier location when it is the only one", () => {
    expect(pickBestLocation([{ location_id: "sloc_ascolour" }])).toBe(
      "sloc_ascolour"
    )
  })

  it("breaks ties deterministically rather than by row order", () => {
    const a = pickBestLocation([{ location_id: "sloc_b" }, { location_id: "sloc_a" }])
    const b = pickBestLocation([{ location_id: "sloc_a" }, { location_id: "sloc_b" }])
    expect(a).toBe("sloc_a")
    expect(a).toBe(b)
  })
})

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
