import { lineMockupGroupKey } from "../customizer-order-artifacts"

describe("lineMockupGroupKey", () => {
  const line = (over: Record<string, unknown> = {}) => ({
    id: "li_1",
    product_id: "prod_1",
    variant_title: "ORANGE / S",
    metadata: { customizerDesign: { group_id: "g1" } },
    ...over,
  })

  it("collapses sizes within the same design group + colour", () => {
    const a = lineMockupGroupKey(line({ id: "li_1", variant_title: "ORANGE / S" }))
    const b = lineMockupGroupKey(line({ id: "li_2", variant_title: "ORANGE / XL" }))
    expect(a).toBe(b)
  })

  it("keeps different colours distinct within one group", () => {
    const a = lineMockupGroupKey(line({ variant_title: "ORANGE / S" }))
    const b = lineMockupGroupKey(line({ id: "li_2", variant_title: "BLACK / S" }))
    expect(a).not.toBe(b)
  })

  it("keeps different design groups distinct", () => {
    const a = lineMockupGroupKey(line())
    const b = lineMockupGroupKey(
      line({ id: "li_2", metadata: { customizerDesign: { group_id: "g2" } } })
    )
    expect(a).not.toBe(b)
  })

  it("size-only variant titles still collapse (no false colour split)", () => {
    const a = lineMockupGroupKey(line({ id: "li_1", variant_title: "S" }))
    const b = lineMockupGroupKey(line({ id: "li_2", variant_title: "XL" }))
    expect(a).toBe(b)
  })

  it("falls back to product_id then line id without a group_id", () => {
    expect(lineMockupGroupKey(line({ metadata: {} }))).toContain("prod_1")
    expect(
      lineMockupGroupKey(line({ metadata: {}, product_id: null, variant_title: null }))
    ).toBe("li_1")
  })
})
