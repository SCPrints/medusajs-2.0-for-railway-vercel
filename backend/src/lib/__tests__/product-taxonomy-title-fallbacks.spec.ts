import {
  applyTitleFallbacks,
  inferDemographicTagFromTitle,
  inferTypeFromTitle,
} from "../product-taxonomy"

describe("inferTypeFromTitle", () => {
  it("returns null for empty / blank input", () => {
    expect(inferTypeFromTitle("")).toBeNull()
    expect(inferTypeFromTitle("   ")).toBeNull()
    expect(inferTypeFromTitle(null)).toBeNull()
    expect(inferTypeFromTitle(undefined)).toBeNull()
  })

  it("picks the garment-type word at the END of the title (right-to-left)", () => {
    expect(inferTypeFromTitle("Parcel Tote")).toBe("Bags")
    expect(inferTypeFromTitle("Womens Venture Short Sleeve Polo")).toBe("Polos")
    expect(inferTypeFromTitle("Botany Kids Polos - N3307")).toBe("Polos")
    expect(inferTypeFromTitle("Mens Classic Premium Crew Tee")).toBe("T-Shirts")
  })

  it("prefers longer multi-word matches at the same anchor", () => {
    // "long sleeve shirt" → Longsleeves should beat "shirt" → Shirts
    expect(inferTypeFromTitle("Mens Long Sleeve Shirt")).toBe("Longsleeves")
    // Hyphenated "T-Shirt" tokenises to "t" + "shirt", so we need the
    // space-form alias "long sleeve t shirt" → Longsleeves to win over
    // the rightmost 2-gram "t shirt" → T-Shirts. Both forms are now in
    // `PRODUCT_TYPE_ALIASES` so this matches.
    expect(inferTypeFromTitle("Womens Long Sleeve T-Shirt")).toBe("Longsleeves")
    expect(inferTypeFromTitle("Mens Long Sleeve Tee")).toBe("Longsleeves")
  })

  it("handles hyphens and slashes as token separators", () => {
    expect(inferTypeFromTitle("AS Colour T-Shirt")).toBe("T-Shirts")
    expect(inferTypeFromTitle("Tank/Singlet")).toBe("Singlets / Tanks")
  })

  it("ignores punctuation and trailing style codes", () => {
    expect(inferTypeFromTitle("Bayview Lady Shirt - 2906T")).toBe("Shirts")
    expect(inferTypeFromTitle("Botany Kids Polos | N3307")).toBe("Polos")
  })

  it("returns null when no garment-type word is present", () => {
    expect(inferTypeFromTitle("Some Unbranded Mystery Item")).toBeNull()
    expect(inferTypeFromTitle("XYZ 12345")).toBeNull()
  })

  it("logs unknowns to unknownLog when provided", () => {
    const log: string[] = []
    inferTypeFromTitle("Some Unbranded Mystery Item", log)
    expect(log.length).toBe(1)
    expect(log[0]).toContain("Some Unbranded Mystery Item")
  })
})

describe("inferDemographicTagFromTitle", () => {
  it("detects womens cues", () => {
    expect(inferDemographicTagFromTitle("Womens Venture Polo")).toBe("Women")
    expect(inferDemographicTagFromTitle("Ladies Bayview Shirt")).toBe("Women")
    expect(inferDemographicTagFromTitle("Lady Shirt 3/4 Sleeve")).toBe("Women")
  })

  it("detects mens cues", () => {
    expect(inferDemographicTagFromTitle("Mens Classic Polo")).toBe("Men")
    expect(inferDemographicTagFromTitle("Men's Crew Tee")).toBe("Men")
  })

  it("detects kids cues — including boys/girls/toddler/baby variants", () => {
    expect(inferDemographicTagFromTitle("Botany Kids Polos")).toBe("Kids")
    expect(inferDemographicTagFromTitle("Youth Tee")).toBe("Kids")
    expect(inferDemographicTagFromTitle("Toddler Singlet")).toBe("Kids")
    expect(inferDemographicTagFromTitle("Baby Onesie")).toBe("Kids")
    expect(inferDemographicTagFromTitle("Boys T-Shirt")).toBe("Kids")
    expect(inferDemographicTagFromTitle("Girls Polo")).toBe("Kids")
  })

  it("kids cues win over womens/mens cues (defensive bias)", () => {
    // Unrealistic but the resolution should still be deterministic.
    expect(inferDemographicTagFromTitle("Womens Kids Polo")).toBe("Kids")
  })

  it("returns null when no demographic cue is present", () => {
    expect(inferDemographicTagFromTitle("Parcel Tote")).toBeNull()
    expect(inferDemographicTagFromTitle("Bayview Polo")).toBeNull()
    expect(inferDemographicTagFromTitle("")).toBeNull()
    expect(inferDemographicTagFromTitle(null)).toBeNull()
  })

  it("does not match partial words", () => {
    // "Gentle Touch Polo" shouldn't trip the mens regex on "Gent"
    expect(inferDemographicTagFromTitle("Gentle Touch Polo")).toBeNull()
    // "Kidnap Prevention Tee" (hypothetical) shouldn't trip kids on "Kid"
    expect(inferDemographicTagFromTitle("Kidnap Prevention Tee")).toBeNull()
  })
})

describe("applyTitleFallbacks", () => {
  it("fills missing productType from the title", () => {
    const result = applyTitleFallbacks(
      { productType: null, tags: [] },
      "Parcel Tote"
    )
    expect(result.productType).toBe("Bags")
  })

  it("does not overwrite an existing productType", () => {
    const result = applyTitleFallbacks(
      { productType: "Hoodies", tags: [] },
      "Parcel Tote" // would infer Bags
    )
    expect(result.productType).toBe("Hoodies")
  })

  it("appends a demographic tag inferred from the title", () => {
    const result = applyTitleFallbacks(
      { productType: "Polos", tags: [] },
      "Womens Venture Short Sleeve Polo"
    )
    expect(result.tags).toContain("Women")
  })

  it("does not duplicate a demographic tag already present", () => {
    const result = applyTitleFallbacks(
      { productType: "Polos", tags: ["Women"] },
      "Womens Venture Short Sleeve Polo"
    )
    expect(result.tags.filter((t) => t === "Women").length).toBe(1)
  })

  it("does not mutate the input", () => {
    const input = { productType: null, tags: ["Cotton"] }
    const result = applyTitleFallbacks(input, "Womens Polo")
    expect(input.productType).toBeNull()
    expect(input.tags).toEqual(["Cotton"])
    expect(result.productType).toBe("Polos")
    expect(result.tags).toEqual(["Cotton", "Women"])
  })

  it("handles the three screenshot cases from the audit", () => {
    // AS Colour: Parcel Tote — API gave us nothing
    expect(
      applyTitleFallbacks({ productType: null, tags: [] }, "Parcel Tote")
    ).toEqual({ productType: "Bags", tags: [] })

    // FashionBiz: Womens Venture Short Sleeve Polo — API gave us nothing
    expect(
      applyTitleFallbacks(
        { productType: null, tags: [] },
        "Womens Venture Short Sleeve Polo"
      )
    ).toEqual({ productType: "Polos", tags: ["Women"] })

    // Aussie Pacific: Botany Kids Polos — API already produced both fields
    expect(
      applyTitleFallbacks(
        { productType: "Polos", tags: ["Kids"] },
        "Botany Kids Polos - N3307"
      )
    ).toEqual({ productType: "Polos", tags: ["Kids"] })
  })
})
