import { pricerLineGroupId, pricerLineVariant } from "../quote-pricer-lines"

const variants = [
  { id: "v_black_s", colour: "Black", size: "S" },
  { id: "v_white_s", colour: "White", size: "S" },
  { id: "v_white_m", colour: "White", size: "M" },
]
// Same contract as the pricer's variantAxes().variantFor: "" = any size.
const variantFor = (colour: string | null, size: string) =>
  variants.find((v) => (colour == null || v.colour === colour) && (size === "" || v.size === size)) ?? null

describe("pricerLineVariant", () => {
  it("keeps the colour on an Any-size line (not null → product default on convert)", () => {
    expect(pricerLineVariant({ supplied: false, colour: "White", size: "", variantFor })?.id).toBe("v_white_s")
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
