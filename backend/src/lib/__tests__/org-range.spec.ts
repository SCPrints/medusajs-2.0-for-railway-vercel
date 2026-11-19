import { buildRangeLines, mergeRangeItems, rangeDesignReadiness, variantColourSize } from "../org-range"

describe("rangeDesignReadiness", () => {
  it("is ready when the pricing can read decorated positions", () => {
    expect(rangeDesignReadiness({ prints: [{ side: "front", sizeId: "up_to_a4" }], has_product: true }).ready).toBe(true)
    expect(rangeDesignReadiness({ artifacts: [{ side: "back" }], has_product: true }).ready).toBe(true)
  })
  it("never guesses from a design with no prints or print files", () => {
    expect(rangeDesignReadiness({ prints: [], artifacts: [], has_product: true })).toEqual({
      ready: false,
      reason: "Open it in the Studio once to finish it.",
    })
    expect(rangeDesignReadiness({ prints: [{ side: "front" }], has_product: false }).ready).toBe(false)
  })
})

describe("mergeRangeItems", () => {
  it("sums duplicates and drops junk", () => {
    expect(
      mergeRangeItems([
        { design_id: "d1", variant_id: "v1", quantity: 2 },
        { design_id: "d1", variant_id: "v1", quantity: 3 },
        { design_id: "d1", variant_id: "v2", quantity: 0 },
        { design_id: "", variant_id: "v2", quantity: 4 },
      ])
    ).toEqual([{ design_id: "d1", variant_id: "v1", quantity: 5 }])
  })
})

describe("buildRangeLines", () => {
  const design = {
    id: "des_1",
    base_variant_id: "v_black_m",
    customizer_metadata: {
      type: "fabric_customizer",
      variantId: "v_black_m",
      scpPrintSizeId: "up_to_a4",
      prints: [{ side: "front", sizeId: "up_to_a4" }],
      artifacts: [{ side: "front", mockupUrl: "https://x/black.png", printUrl: "https://x/print.png" }],
      pricing: { server: { unit_price_major: 1 }, totalPriceCents: 99 },
      group_id: "old-group",
    },
  }
  const product = {
    handle: "staple-tee",
    title: "Staple Tee",
    variants: [
      { id: "v_black_m", title: "Black / M" },
      { id: "v_black_l", title: "Black / L" },
      { id: "v_navy_m", title: "Navy / M" },
    ],
  }

  it("builds Studio-shaped lines from the stored design", () => {
    const lines = buildRangeLines({
      design,
      product,
      items: [
        { variant_id: "v_black_l", quantity: 4 },
        { variant_id: "v_navy_m", quantity: 2 },
      ],
      groupId: "g1",
      organisationId: "org_1",
    })
    expect(lines).toHaveLength(2)
    const [black, navy] = lines
    expect(black).toMatchObject({ design_id: "des_1", group_id: "g1", variant_id: "v_black_l", quantity: 4, print_size_id: "up_to_a4" })
    const cd = black.metadata!.customizerDesign as Record<string, any>
    expect(cd.variantId).toBe("v_black_l")
    expect(cd.group_id).toBe("g1")
    expect(cd.group_size).toBe(2)
    expect(cd.pricing).toBeUndefined()
    expect(cd.artifacts[0].mockupUrl).toBe("https://x/black.png")
    expect(black.metadata).toMatchObject({ product_handle: "staple-tee", source_design_id: "des_1", organisation_id: "org_1" })
    // Another colour: the saved mockup shows the wrong garment, the print file is still right.
    const navyCd = navy.metadata!.customizerDesign as Record<string, any>
    expect(navyCd.artifacts[0]).toEqual({ side: "front", printUrl: "https://x/print.png" })
  })
})

describe("variantColourSize", () => {
  it("splits the catalogue's Colour / Size titles", () => {
    expect(variantColourSize("Black / 2XL")).toEqual({ colour: "Black", size: "2XL" })
    expect(variantColourSize("OSFA")).toEqual({ colour: null, size: "OSFA" })
  })
})
