import {
  GARMENTS,
  buildExport,
  checkMeasurement,
  findStep,
  sizeStatus,
  sortSizes,
} from "../garment-measurements"

const chest = findStep("hoodie", "chest_flat")!
const sizes = ["XS", "S", "M", "L", "XL", "2XL"]

describe("sortSizes", () => {
  it("puts letter sizes in garment order", () => {
    expect(sortSizes(["2XL", "M", "XS", "5XL", "L", "XXL"])).toEqual(["XS", "M", "L", "2XL", "XXL", "5XL"])
  })
})

describe("checkMeasurement", () => {
  it("passes a value between its neighbours", () => {
    expect(checkMeasurement({ step: chest, value: 60, size: "L", sizes, bySize: { M: 57, XL: 63 } })).toBeNull()
  })
  it("asks when L is smaller than M", () => {
    expect(checkMeasurement({ step: chest, value: 55, size: "L", sizes, bySize: { M: 57, XL: 63 } })).toMatch(/less than M/)
  })
  it("asks when a size is bigger than the next one up, skipping sizes with no value", () => {
    expect(checkMeasurement({ step: chest, value: 66, size: "M", sizes, bySize: { XL: 63 } })).toMatch(/more than XL/)
  })
  it("allows half a centimetre of tape noise", () => {
    expect(checkMeasurement({ step: chest, value: 56.6, size: "L", sizes, bySize: { M: 57 } })).toBeNull()
  })
  it("spots a missing decimal point", () => {
    const pocket = findStep("hoodie", "pocket_height")!
    expect(checkMeasurement({ step: { ...pocket, min: 20, max: 50 }, value: 367, size: "4XL", sizes, bySize: {} })).toMatch(
      /Did you mean 36.7\?/
    )
  })
  it("only suggests a decimal fix that also fits between the sizes", () => {
    expect(checkMeasurement({ step: chest, value: 367, size: "L", sizes, bySize: { M: 57, XL: 63 } })).toMatch(/bigger than we'd expect/)
    expect(checkMeasurement({ step: chest, value: 587, size: "L", sizes, bySize: { M: 57, XL: 63 } })).toMatch(/Did you mean 58.7\?/)
  })
  it("flags values way out of range", () => {
    expect(checkMeasurement({ step: chest, value: 300, size: "M", sizes, bySize: {} })).toMatch(/Did you mean 30\?|bigger/)
    expect(checkMeasurement({ step: chest, value: 0, size: "M", sizes, bySize: {} })).toMatch(/Enter/)
  })
})

describe("sizeStatus", () => {
  const all = GARMENTS.tee.steps.filter((s) => !s.optional).map((s) => ({ size: "M", key: s.key, value_cm: 10 }))
  it("reads todo / partly / done / estimated", () => {
    expect(sizeStatus("tee", [])).toBe("todo")
    expect(sizeStatus("tee", all.slice(1))).toBe("partly")
    expect(sizeStatus("tee", all)).toBe("done")
    expect(sizeStatus("tee", [...all.slice(1), { ...all[0], estimated: true }])).toBe("estimated")
  })
})

describe("buildExport", () => {
  it("returns the taped-file shape, sizes in order, _inferred on estimated sizes", () => {
    const out = buildExport("hoodie", [
      { size: "L", key: "chest_flat", value_cm: 58.0000001 },
      { size: "S", key: "chest_flat", value_cm: 53.5, estimated: true },
      { size: "L", key: "drawcord", value_cm: 23 },
      { size: "L", key: "neck_seam_round", value_cm: 65 },
    ])
    expect(Object.keys(out)).toEqual(["S", "L"])
    expect(out.S).toEqual({ body_length_to_seam: true, _inferred: true, chest_flat: 53.5 })
    expect(out.L).toEqual({ body_length_to_seam: true, neck_seam_round: 65, chest_flat: 58, drawcord: 23 })
    expect(Object.keys(out.L)).toEqual(["body_length_to_seam", "neck_seam_round", "chest_flat", "drawcord"])
  })
})
