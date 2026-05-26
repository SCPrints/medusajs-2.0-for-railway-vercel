import {
  applyTitleFallbacks,
  classifyDncProduct,
  classifyRamoProduct,
} from "../product-taxonomy"

describe("classifyDncProduct", () => {
  it("returns null type + empty tags (DNC CSV carries no structured taxonomy)", () => {
    const result = classifyDncProduct({
      ProductCode: "1234",
      Description: "Ladies Bootleg Pant",
      Description2: "Navy",
      Description3: "12",
    })
    expect(result).toEqual({ productType: null, tags: [] })
  })

  it("does not crash on empty rows", () => {
    const result = classifyDncProduct({})
    expect(result).toEqual({ productType: null, tags: [] })
  })

  it("delegates type/tag inference to applyTitleFallbacks", () => {
    const classified = classifyDncProduct({
      ProductCode: "5567",
      Description: "Ladies Cotton Drill Cargo Pant",
    })
    const result = applyTitleFallbacks(classified, "Ladies Cotton Drill Cargo Pant")
    expect(result.productType).toBe("Pants")
    expect(result.tags).toContain("Women")
  })

  it("title-fallback fills demographic for Mens DNC items", () => {
    const classified = classifyDncProduct({
      Description: "Mens Cool-Breeze Cotton Drill Short Sleeve Shirt",
    })
    const result = applyTitleFallbacks(
      classified,
      "Mens Cool-Breeze Cotton Drill Short Sleeve Shirt"
    )
    expect(result.productType).toBe("Shirts")
    expect(result.tags).toContain("Men")
  })

  it("ungendered DNC workwear gets a type but no demographic tag (audience routes via brand handle)", () => {
    const classified = classifyDncProduct({
      Description: "Hi-Vis Cotton Drill Trouser",
    })
    const result = applyTitleFallbacks(classified, "Hi-Vis Cotton Drill Trouser")
    expect(result.productType).toBe("Pants")
    // Without a demographic in the title, no Mens/Womens tag — DNC's
    // brand handle is in WORKWEAR_BRAND_HANDLES so audience routing
    // still puts it in /workwear via shop-categories.ts:inferAudiences.
    expect(result.tags).not.toContain("Men")
    expect(result.tags).not.toContain("Women")
  })
})

describe("classifyRamoProduct", () => {
  it("prefers attribute_type over primary_category for type resolution", () => {
    // Real bug from Ramo CSV: AP403B has primary_category="Accessories" but
    // attribute_type="Apron" and title says "Full-bib Apron". The classifier
    // must trust attribute_type, not the catch-all primary_category.
    const result = classifyRamoProduct({
      parent_code: "AP403B",
      primary_category: "Accessories",
      attribute_type: "Apron",
      name: "Full-bib Apron - 100% cotton canvas apron",
    })
    expect(result.productType).toBe("Aprons")
  })

  it("falls back to primary_category when attribute_type is empty", () => {
    const result = classifyRamoProduct({
      parent_code: "P100",
      primary_category: "Polos",
      attribute_type: "",
    })
    expect(result.productType).toBe("Polos")
    expect(result.tags).toEqual([])
  })

  it("handles comma-separated attribute_type values (e.g. 'Jacket,Hoodie')", () => {
    // Ramo's CSV emits combos for products that span types — pick the first
    // canonical match left-to-right.
    const result = classifyRamoProduct({
      parent_code: "X100",
      attribute_type: "Jacket,Hoodie",
    })
    expect(result.productType).toBe("Jackets")
  })

  it("handles 'Fleece,Hoodie' (Fleece resolves first via PRODUCT_TYPE_ALIASES)", () => {
    const result = classifyRamoProduct({
      parent_code: "X101",
      attribute_type: "Fleece,Hoodie",
    })
    // 'fleece' is in PRODUCT_TYPE_ALIASES → Jackets
    expect(result.productType).toBe("Jackets")
  })

  it("resolves productType from a compound primary_category, skipping demographic tokens", () => {
    // "Ladies Polos" should resolve to Polos (token-split), not "Ladies Polos"
    // title-cased. Defensive against Ramo varying primary_category granularity.
    const result = classifyRamoProduct({
      parent_code: "P200",
      primary_category: "Ladies Polos",
    })
    expect(result.productType).toBe("Polos")
    expect(result.tags).toContain("Women")
  })

  it("extracts Kids demographic from primary_category tokens", () => {
    const result = classifyRamoProduct({
      parent_code: "K300",
      primary_category: "Kids Tees",
    })
    expect(result.productType).toBe("T-Shirts")
    expect(result.tags).toContain("Kids")
  })

  it("returns null type when primary_category is empty", () => {
    const result = classifyRamoProduct({
      parent_code: "X400",
      primary_category: "",
    })
    expect(result.productType).toBeNull()
    expect(result.tags).toEqual([])
  })

  it("logs unknowns to unknownLog when type can't be resolved", () => {
    const log: string[] = []
    const result = classifyRamoProduct(
      {
        parent_code: "Y500",
        primary_category: "Mystery Garment",
      },
      log
    )
    expect(result.productType).toBeNull()
    expect(log.some((m) => m.includes("Mystery Garment"))).toBe(true)
  })

  it("returns no demographic tag when primary_category has only garment word", () => {
    const result = classifyRamoProduct({
      parent_code: "P600",
      primary_category: "Aprons",
    })
    expect(result.productType).toBe("Aprons")
    expect(result.tags).not.toContain("Men")
    expect(result.tags).not.toContain("Women")
    expect(result.tags).not.toContain("Kids")
  })

  it("ignores attribute_type entirely (often noise like 'Adult')", () => {
    const result = classifyRamoProduct({
      parent_code: "P700",
      primary_category: "Hoodies",
      attribute_type: "Adult",
    })
    expect(result.productType).toBe("Hoodies")
    expect(result.tags).not.toContain("Adult")
  })

  it("works with the Ramo brand-handle fallback for ungendered apparel", () => {
    // End-to-end: classifier + applyTitleFallbacks with brandHandle="ramo"
    // should land a Unisex tag for a polo with no demographic in title or
    // primary_category. Matches the AS Colour convention.
    const classified = classifyRamoProduct({
      parent_code: "P800",
      primary_category: "Polos",
    })
    const result = applyTitleFallbacks(classified, "Ranger Polo", undefined, "ramo")
    expect(result.productType).toBe("Polos")
    expect(result.tags).toContain("Unisex")
  })

  it("explicit Womens cue in primary_category beats the brand-handle Unisex fallback", () => {
    const classified = classifyRamoProduct({
      parent_code: "P900",
      primary_category: "Ladies Polos",
    })
    const result = applyTitleFallbacks(classified, "Ranger Polo", undefined, "ramo")
    expect(result.tags).toContain("Women")
    expect(result.tags).not.toContain("Unisex")
  })

  it("explicit Mens cue in title beats brand-handle Unisex fallback", () => {
    const classified = classifyRamoProduct({
      parent_code: "P910",
      primary_category: "Polos",
    })
    const result = applyTitleFallbacks(classified, "Mens Ranger Polo", undefined, "ramo")
    expect(result.tags).toContain("Men")
    expect(result.tags).not.toContain("Unisex")
  })
})
