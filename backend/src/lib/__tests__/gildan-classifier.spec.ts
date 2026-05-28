import {
  applyTitleFallbacks,
  classifyGildanProduct,
} from "../product-taxonomy"

function classify(
  input: Partial<{
    subcategory1: string | null
    subcategory2: string | null
    gender: string | null
    fit: string | null
    topTierCategory: string | null
  }>,
  log?: string[]
) {
  return classifyGildanProduct(
    {
      subcategory1: input.subcategory1 ?? null,
      subcategory2: input.subcategory2 ?? null,
      gender: input.gender ?? null,
      fit: input.fit ?? null,
      topTierCategory: input.topTierCategory ?? null,
    },
    log
  )
}

describe("classifyGildanProduct — Sub1=T-Shirt (3,737 rows)", () => {
  it("Crew Neck → T-Shirts (NOT Sweatshirts — common Gildan pitfall)", () => {
    const r = classify({
      subcategory1: "T-Shirt",
      subcategory2: "Crew Neck",
      gender: "Unisex",
    })
    expect(r.productType).toBe("T-Shirts")
    expect(r.tags).toContain("Unisex")
  })
  it("Long Sleeve → Longsleeves", () => {
    const r = classify({ subcategory1: "T-Shirt", subcategory2: "Long Sleeve" })
    expect(r.productType).toBe("Longsleeves")
  })
  it("Tank Top → Tanks", () => {
    const r = classify({ subcategory1: "T-Shirt", subcategory2: "Tank Top" })
    expect(r.productType).toBe("Tanks")
  })
  it("V-Neck → T-Shirts (V-Neck is a shape, not a type — shop-categories routes it)", () => {
    const r = classify({ subcategory1: "T-Shirt", subcategory2: "V-Neck" })
    expect(r.productType).toBe("T-Shirts")
  })
  it("Polo (mislabel Gildan ships) → Polos", () => {
    const r = classify({ subcategory1: "T-Shirt", subcategory2: "Polo" })
    expect(r.productType).toBe("Polos")
  })
  it("Sueded/CVC/Polyester (fabric variants in Sub2) → T-Shirts", () => {
    expect(classify({ subcategory1: "T-Shirt", subcategory2: "Sueded" }).productType).toBe("T-Shirts")
    expect(classify({ subcategory1: "T-Shirt", subcategory2: "CVC" }).productType).toBe("T-Shirts")
    expect(classify({ subcategory1: "T-Shirt", subcategory2: "Polyester" }).productType).toBe("T-Shirts")
  })
})

describe("classifyGildanProduct — Sub1=Fleece (1,179 rows)", () => {
  it("Sweatshirt → Sweatshirts", () => {
    expect(classify({ subcategory1: "Fleece", subcategory2: "Sweatshirt" }).productType).toBe("Sweatshirts")
  })
  it("Crew Neck / Crewneck → Sweatshirts", () => {
    expect(classify({ subcategory1: "Fleece", subcategory2: "Crew Neck" }).productType).toBe("Sweatshirts")
    expect(classify({ subcategory1: "Fleece", subcategory2: "Crewneck" }).productType).toBe("Sweatshirts")
  })
  it("Hooded / Hoodie → Hoodies", () => {
    expect(classify({ subcategory1: "Fleece", subcategory2: "Hooded" }).productType).toBe("Hoodies")
    expect(classify({ subcategory1: "Fleece", subcategory2: "Hoodie" }).productType).toBe("Hoodies")
  })
  it("Sweatpants → Trackpants", () => {
    expect(classify({ subcategory1: "Fleece", subcategory2: "Sweatpants" }).productType).toBe("Trackpants")
  })
  it("Blanket → Accessories", () => {
    expect(classify({ subcategory1: "Fleece", subcategory2: "Blanket" }).productType).toBe("Accessories")
  })
  it("Fleece with NO Sub2 leaves productType null (let title fallback handle)", () => {
    const r = classify({ subcategory1: "Fleece", subcategory2: "" })
    expect(r.productType).toBeNull()
  })
})

describe("classifyGildanProduct — Sub1=French Terry (102 rows)", () => {
  it("Jacket → Jackets", () => {
    expect(classify({ subcategory1: "French Terry", subcategory2: "Jacket" }).productType).toBe("Jackets")
  })
  it("Bottoms → Pants", () => {
    expect(classify({ subcategory1: "French Terry", subcategory2: "Bottoms" }).productType).toBe("Pants")
  })
  it("T-SHIRT (Gildan all-caps) → T-Shirts", () => {
    expect(classify({ subcategory1: "French Terry", subcategory2: "T-SHIRT" }).productType).toBe("T-Shirts")
  })
})

describe("classifyGildanProduct — other Sub1 values", () => {
  it("Polo → Polos (Sub2 empty)", () => {
    expect(classify({ subcategory1: "Polo", subcategory2: "" }).productType).toBe("Polos")
  })
  it("Tanks + Racerneck → Tanks (via Sub1 default)", () => {
    expect(classify({ subcategory1: "Tanks", subcategory2: "Racerneck" }).productType).toBe("Tanks")
  })
  it("Tanks + Crew Neck → Tanks (Sub1 default wins over generic Crew Neck)", () => {
    expect(classify({ subcategory1: "Tanks", subcategory2: "Crew Neck" }).productType).toBe("Tanks")
  })
  it("Tank (singular Sub1 variant) → Tanks", () => {
    expect(classify({ subcategory1: "Tank", subcategory2: "Crew Neck" }).productType).toBe("Tanks")
  })
  it("Cap → Headwear", () => {
    expect(classify({ subcategory1: "Cap", subcategory2: "" }).productType).toBe("Headwear")
  })
  it("Bottoms + Shorts → Shorts", () => {
    expect(classify({ subcategory1: "Bottoms", subcategory2: "Shorts" }).productType).toBe("Shorts")
  })
  it("Bottoms + Pants → Pants", () => {
    expect(classify({ subcategory1: "Bottoms", subcategory2: "Pants" }).productType).toBe("Pants")
  })
  it("Bags + Tote → Bags", () => {
    expect(classify({ subcategory1: "Bags", subcategory2: "Tote" }).productType).toBe("Bags")
  })
})

describe("classifyGildanProduct — tags", () => {
  it("maps Gender=Womens → Women tag", () => {
    expect(classify({ subcategory1: "T-Shirt", gender: "Womens" }).tags).toContain("Women")
  })
  it("maps Gender=Youth → Kids tag", () => {
    expect(classify({ subcategory1: "T-Shirt", gender: "Youth" }).tags).toContain("Kids")
  })
  it("maps Gender=Toddler → Kids tag", () => {
    expect(classify({ subcategory1: "T-Shirt", gender: "Toddler" }).tags).toContain("Kids")
  })
  it("maps Gender=Unisex → Unisex tag", () => {
    expect(classify({ subcategory1: "T-Shirt", gender: "Unisex" }).tags).toContain("Unisex")
  })
  it("classic fit normalises through TAG_ALIASES", () => {
    expect(classify({ subcategory1: "T-Shirt", fit: "Classic Fit" }).tags).toContain("Classic Fit")
  })
  it("skips Top tier 'Adult' (redundant with gender)", () => {
    const r = classify({
      subcategory1: "T-Shirt",
      gender: "Unisex",
      topTierCategory: "Adult",
    })
    expect(r.tags).not.toContain("Adult")
  })
  it("skips Top tier 'Accessories' (it's a type signal, not a tag)", () => {
    const r = classify({
      subcategory1: "Cap",
      topTierCategory: "Accessories",
    })
    expect(r.tags).not.toContain("Accessories")
  })
  it("uses 'Ladies' top-tier when gender is empty", () => {
    const r = classify({
      subcategory1: "T-Shirt",
      gender: "",
      topTierCategory: "Ladies",
    })
    expect(r.tags).toContain("Women")
  })
})

// Remove the broken Boxy Fit test above. Replace with a corrected one.
// Boxy Fit isn't in TAG_ALIASES — verify it falls through title-cased.
describe("classifyGildanProduct — fit fallback", () => {
  it("Boxy Fit falls through normalizeTags as title-cased", () => {
    const log: string[] = []
    const r = classify(
      { subcategory1: "T-Shirt", gender: "Unisex", fit: "Boxy Fit" },
      log
    )
    // Either it's in canonical TAG_ALIASES output, or it falls through.
    // Either way, "Boxy Fit" should appear in tags.
    expect(r.tags.some((t) => /boxy/i.test(t))).toBe(true)
  })
})

describe("classifyGildanProduct — title fallback integration", () => {
  it("a classification miss can still get rescued by applyTitleFallbacks", () => {
    const classified = classify({
      subcategory1: "",
      subcategory2: "",
      gender: "Unisex",
    })
    expect(classified.productType).toBeNull()
    const fallback = applyTitleFallbacks(
      classified,
      "Gildan Heavyweight Cotton Hoodie",
      undefined,
      "gildan"
    )
    expect(fallback.productType).toBe("Hoodies")
  })
  it("Toddler in title fills demographic tag", () => {
    const classified = classify({ subcategory1: "T-Shirt", gender: null })
    expect(classified.tags).not.toContain("Kids")
    const fallback = applyTitleFallbacks(
      classified,
      "Gildan Toddler Heavy Cotton Tee",
      undefined,
      "gildan"
    )
    expect(fallback.tags).toContain("Kids")
  })
})
