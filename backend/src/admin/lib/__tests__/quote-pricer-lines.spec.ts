import { pricerDesignSource, pricerLineGroupId, pricerLineVariant } from "../quote-pricer-lines"

describe("pricerDesignSource", () => {
  const saved = new Map([
    ["jp_r_row1:any", { id: "jp_r_row1:any", group_id: "g_1", customizerDesign: true }],
    ["jp_r_row2:M", { id: "jp_r_row2:M", group_id: "g_2" }],
  ])
  it("keeps the line's own design", () => {
    expect(pricerDesignSource(saved, "jp_r_row1:any", "g_1")?.id).toBe("jp_r_row1:any")
  })
  it("takes the group's design when sizes replace an any-size line", () => {
    expect(pricerDesignSource(saved, "jp_r_row1:L", "g_1")?.id).toBe("jp_r_row1:any")
  })
  it("never borrows another group's design", () => {
    expect(pricerDesignSource(saved, "jp_r_row2:L", "g_2")).toBeNull()
  })
})

const variants = [
  { id: "v_black_s", colour: "Black", size: "S" },
  { id: "v_white_s", colour: "White", size: "S" },
  { id: "v_white_m", colour: "White", size: "M" },
]
// Same contract as the pricer's variantAxes().variantFor: "" = any size.
const variantFor = (colour: string | null, size: string) =>
  variants.find((v) => (colour == null || v.colour === colour) && (size === "" || v.size === size)) ?? null

describe("pricerLineVariant", () => {
  it("never picks a size for an Any line", () => {
    expect(pricerLineVariant({ supplied: false, colour: "White", size: "", variantFor })).toBeNull()
  })
  it("picks the exact variant for a sized cell", () => {
    expect(pricerLineVariant({ supplied: false, colour: "White", size: "M", variantFor })?.id).toBe("v_white_m")
  })
  it("never sets a variant for customer-supplied garments", () => {
    expect(pricerLineVariant({ supplied: true, colour: "White", size: "M", variantFor })).toBeNull()
    expect(pricerLineVariant({ supplied: false, colour: "White", size: "M", variantFor: null })).toBeNull()
  })
})

describe("pricerLineGroupId", () => {
  it("shares the group id unless the row has its own design", () => {
    expect(pricerLineGroupId("g_1", { id: "row_a" })).toBe("g_1")
    expect(pricerLineGroupId("g_1", null)).toBe("g_1")
    expect(pricerLineGroupId("g_1", { id: "row_a", ownDesign: true })).toBe("g_1~row_a")
  })
})
