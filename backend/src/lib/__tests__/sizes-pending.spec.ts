import {
  colourFromAnySizeTitle,
  isSizesPendingLine,
  onlyVariantFor,
  quoteLineNeedsSizes,
  shortSizes,
  sizeChoices,
  sizeSplitError,
  sizesPendingFromQuoteLine,
  sizesPendingUnits,
} from "../sizes-pending"

describe("colour of a waiting line", () => {
  it("reads it from the pricer title when the line has none", () => {
    expect(colourFromAnySizeTitle("Staple Tee — BLACK (any size)")).toBe("BLACK")
    expect(colourFromAnySizeTitle("Crew shirts — JB's Street Spider Polo, Black/Orange (any size)")).toBe("Black/Orange")
    expect(colourFromAnySizeTitle("Staple Tee — BLACK / M")).toBeNull()
    expect(sizesPendingFromQuoteLine({ colour: "Navy", title: "Tee — BLACK (any size)" }).colour).toBe("Navy")
    expect(sizesPendingFromQuoteLine({ title: "Tee — BLACK (any size)" }).colour).toBe("BLACK")
  })
})

describe("size choices", () => {
  const tee = [
    { id: "b_s", title: "BLACK / S" },
    { id: "w_s", title: "WHITE / S" },
    { id: "b_m", title: "BLACK / M" },
  ]
  it("lists the sizes of the line's colour only", () => {
    expect(sizeChoices(tee, "black")).toEqual([{ variant_id: "b_s", size: "S" }, { variant_id: "b_m", size: "M" }])
    expect(sizeChoices(tee, "Red")).toEqual([])
  })
  it("treats a single size as no size to choose", () => {
    expect(onlyVariantFor(tee, "WHITE")).toBe("w_s")
    expect(onlyVariantFor(tee, "BLACK")).toBeNull()
    expect(onlyVariantFor([{ id: "bag", title: "One Size" }], null)).toBe("bag")
  })
})

describe("shortSizes", () => {
  it("names the sizes the stock can't cover, ignoring untracked ones", () => {
    const want = [
      { variant_id: "s", size: "S", quantity: 4 },
      { variant_id: "l", size: "L", quantity: 4 },
      { variant_id: "x", size: "4XL", quantity: 9 },
    ]
    expect(shortSizes(want, new Map<string, number | null>([["s", 100], ["l", 0], ["x", null]]))).toEqual([{ size: "L", available: 0 }])
  })
})

describe("sizeSplitError", () => {
  const allowed = new Set(["s", "m"])
  const e = (variant_id: string, quantity: number, unit_price = 42.74) => ({ variant_id, quantity, unit_price })
  it("accepts sizes that add up to the line", () => {
    expect(sizeSplitError(10, [e("s", 4), e("m", 6), e("m", 0)], allowed)).toBeNull()
  })
  it("refuses the wrong total, unknown sizes, repeats and missing prices", () => {
    expect(sizeSplitError(10, [e("s", 4)], allowed)).toBe("The sizes add up to 4, the line is 10.")
    expect(sizeSplitError(10, [e("x", 10)], allowed)).toMatch(/isn't this garment/)
    expect(sizeSplitError(10, [e("s", 5), e("s", 5)], allowed)).toMatch(/twice/)
    expect(sizeSplitError(10, [e("s", 10, NaN)], allowed)).toMatch(/price/)
    expect(sizeSplitError(10, [], allowed)).toMatch(/at least one/)
  })
})

describe("quoteLineNeedsSizes", () => {
  it("is true for a garment with no variant", () => {
    expect(quoteLineNeedsSizes({ product_handle: "as-colour-classic-tee-5026" })).toBe(true)
    expect(quoteLineNeedsSizes({ product_id: "prod_1" })).toBe(true)
  })
  it("is true for a pricer Any line, even with the first size's variant saved", () => {
    expect(quoteLineNeedsSizes({ id: "jp_r_row1:any", variant_id: "v_s", product_id: "prod_1" })).toBe(true)
    expect(quoteLineNeedsSizes({ sizes_pending: true, product_id: "prod_1" })).toBe(true)
  })
  it("is false for real sizes, fee lines and customer-supplied garments", () => {
    expect(quoteLineNeedsSizes({ id: "jp_r_row1:M", variant_id: "v_m", product_id: "prod_1" })).toBe(false)
    expect(quoteLineNeedsSizes({ id: "01ABC" })).toBe(false)
    // A fee line that happens to carry an ":any" id (thread spools on order #130).
    expect(quoteLineNeedsSizes({ id: "01M76CRFR9NNBM1HAM9D1HXANE:any" })).toBe(false)
    expect(quoteLineNeedsSizes({ id: "jp_r_row1:any", variant_id: "v", product_handle: "custom-service-line" })).toBe(false)
  })
})

describe("sizesPendingUnits", () => {
  it("counts only pending lines", () => {
    const pending = { quantity: 5, metadata: { sizes_pending: { product_id: null, product_handle: "x", colour: null } } }
    const fee = { quantity: 1, metadata: { quote_custom_line: true } }
    expect(isSizesPendingLine(pending)).toBe(true)
    expect(isSizesPendingLine(fee)).toBe(false)
    expect(sizesPendingUnits([pending, fee, { quantity: 2, metadata: null }])).toBe(5)
  })
})
