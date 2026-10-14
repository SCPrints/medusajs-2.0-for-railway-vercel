import { applyJbsExclusions, groupJbsRows, prettifyJbsTitle } from "../jbs-wear-catalog"
import { classifyJbsWearProduct } from "../product-taxonomy"

const row = (o: Record<string, unknown>) => ({
  Brand: "JB's wear",
  "Style Code": "4P",
  "Product Name": "JB's HV S/S 150G POLO",
  Category: "Hi Vis Tradewear",
  "Sub Category": "Hi Vis Polo",
  "Carton Gross Weight (kg)": 10,
  "Carton Qty": 50,
  "WEBCC Trade": 18.64,
  ...o,
})

describe("jbs-wear catalog parsing", () => {
  it("prettifies titles, keeping acronyms and expanding shorthand", () => {
    expect(prettifyJbsTitle("JB's KIDS S/S 150G HV POLO")).toBe("JB's Kids S/S 150g HV Polo")
    expect(prettifyJbsTitle("PDM LDS THREE LAYER SOFTSHELL JCKT")).toBe(
      "Podium Ladies Three Layer Softshell Jacket"
    )
    expect(prettifyJbsTitle("C of C L/S TEE")).toBe("C of C L/S Tee")
    expect(prettifyJbsTitle("JB's CHEF'S LAYER (SOFTSHELL) VEST")).toBe(
      "JB's Chef's Layer (Softshell) Vest"
    )
  })

  it("groups SKUs, disambiguates colour names shared by two codes, derives weight", () => {
    const { styles, skipped } = groupJbsRows([
      row({ SKU: "4PWSA", Colour: "White", "Colour Code": "WS", Size: "S" }),
      row({ SKU: "4PWXA", Colour: "White", "Colour Code": "WX", Size: "S", "WEBCC Trade": 19.46 }),
      row({ SKU: "4PBKA", Colour: "Black", "Colour Code": "BK", Size: "S" }),
      row({ SKU: "", Colour: "Black", Size: "M" }), // no SKU → skipped
    ])
    expect(skipped).toBe(1)
    expect(styles).toHaveLength(1)
    const s = styles[0]
    expect(s.handle).toBe("jbs-wear-hv-ss-150g-polo-4p")
    expect(s.variants.map((v) => v.colour)).toEqual(["White (WS)", "White (WX)", "Black"])
    expect(s.variants[0].weightGrams).toBe(200)
    expect(s.variants[1].cost).toBe(19.46)
  })

  it("classifies sub-category to type and category to audience tags", () => {
    expect(
      classifyJbsWearProduct({ title: "", category: "Hi Vis Tradewear", subCategory: "Hi Vis Polo" })
    ).toEqual({ productType: "Polos", tags: ["Hi-Vis"] })
    expect(
      classifyJbsWearProduct({ title: "", category: "Corporate", subCategory: "Scrubs" })
    ).toEqual({ productType: null, tags: ["Healthcare"] })
    expect(
      classifyJbsWearProduct({ title: "", category: "Traditional Workwear", subCategory: "Pants" })
    ).toEqual({ productType: "Pants", tags: ["Industrial"] })
  })

  it("excludes whole styles and single colourways", () => {
    const { styles } = groupJbsRows([
      row({ SKU: "4PWSA", Colour: "White", "Colour Code": "WS", Size: "S" }),
      row({ SKU: "4PBKA", Colour: "Black", "Colour Code": "BK", Size: "S" }),
      row({ "Style Code": "1HT", SKU: "1HTNXA", Colour: "Navy", "Colour Code": "NX", Size: "S" }),
    ])
    const out = applyJbsExclusions(styles, ["1ht", "4P/BK"])
    expect(out.removedStyles).toEqual(["1HT"])
    expect(out.removedColourways).toEqual(["4P/BK"])
    expect(out.styles.map((s) => s.variants.map((v) => v.sku))).toEqual([["4PWSA"]])
    expect(applyJbsExclusions(styles, ["4P/WS", "4P/BK"]).removedStyles).toContain("4P")
  })
})
