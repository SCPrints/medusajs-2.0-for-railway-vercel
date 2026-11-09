import { jobMethods } from "../job-methods"

describe("jobMethods", () => {
  it("reads Studio lines: only drawn sides count, print is DTF by default", () => {
    const line = { metadata: { customizerDesign: { artifacts: [{ side: "front" }, { side: "back" }], sideDecorationMethods: { front: "embroidery", left_sleeve: "screen" } } } }
    expect(jobMethods([line])).toEqual(["DTF", "Embroidery"])
  })

  it("reads the Job pricer's positions, Supacolour by channel", () => {
    const state = { groups: [{ positions: [{ method: "print", channel: "supacolour" }, { method: "screen" }, { method: "print", channel: "auto" }] }] }
    expect(jobMethods([{}], state)).toEqual(["DTF", "Supacolour", "Screen"])
  })

  it("is empty for plain garments", () => {
    expect(jobMethods([{ metadata: {} }], null)).toEqual([])
  })
})
