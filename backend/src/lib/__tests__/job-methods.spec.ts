import { jobMethods } from "../job-methods"

describe("jobMethods", () => {
  it("reads Studio lines: only drawn sides count, print is DTF by default", () => {
    const line = { metadata: { customizerDesign: { artifacts: [{ side: "front" }, { side: "back" }], sideDecorationMethods: { front: "embroidery", left_sleeve: "screen" } } } }
    expect(jobMethods([line])).toEqual(["Embroidery"])
    const unset = { customizerDesign: { artifacts: [{ side: "front" }] } }
    expect(jobMethods([unset])).toEqual(["DTF"])
  })

  it("an unset side takes the design's one technique, print only when mixed", () => {
    const cap = { customizerDesign: { artifacts: [{ side: "front" }, { side: "back" }], sideDecorationMethods: { front: "embroidery" } } }
    expect(jobMethods([cap])).toEqual(["Embroidery"])
    const mixed = { customizerDesign: { artifacts: [{ side: "front" }, { side: "back" }, { side: "left_sleeve" }], sideDecorationMethods: { front: "embroidery", back: "screen" } } }
    expect(jobMethods([mixed])).toEqual(["DTF", "Screen", "Embroidery"])
  })

  it("reads the Job pricer's positions, Supacolour by channel", () => {
    const state = { groups: [{ positions: [{ method: "print", channel: "supacolour" }, { method: "screen" }, { method: "print", channel: "auto" }] }] }
    expect(jobMethods([{}], state)).toEqual(["DTF", "Supacolour", "Screen"])
  })

  it("a Studio mockup with no technique on a screen-priced group is not DTF", () => {
    const state = { groups: [{ id: "g1", positions: [{ method: "screen" }] }] }
    const line = { group_id: "g1", customizerDesign: { artifacts: [{ side: "front" }, { side: "back" }] } }
    expect(jobMethods([line], state)).toEqual(["Screen"])
    expect(jobMethods([{ metadata: { group_id: "g1", customizerDesign: line.customizerDesign } }], state)).toEqual(["Screen"])
  })

  it("is empty for plain garments", () => {
    expect(jobMethods([{ metadata: {} }], null)).toEqual([])
  })
})
