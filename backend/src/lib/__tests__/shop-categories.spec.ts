import {
  inferAudiences,
  resolveCategoryHandles,
  TREE,
  type InferenceContext,
} from "../shop-categories"

const ctx = (overrides: Partial<InferenceContext> = {}): InferenceContext => ({
  title: "",
  typeValue: null,
  tags: [],
  brandHandle: null,
  metadata: null,
  ...overrides,
})

describe("inferAudiences", () => {
  it("routes bottles to spirits exclusively", () => {
    expect(
      inferAudiences(ctx({ metadata: { product_class: "bottle" } }))
    ).toEqual(["spirits"])
  })

  it("routes accessory types exclusively (no gender)", () => {
    expect(inferAudiences(ctx({ title: "Mens Cap", typeValue: "Headwear" }))).toEqual(
      ["accessories"]
    )
    expect(inferAudiences(ctx({ title: "Denim Apron", typeValue: "Aprons" }))).toEqual(
      ["accessories"]
    )
  })

  it("infers demographic from title (mens / womens / kids)", () => {
    expect(inferAudiences(ctx({ title: "Mens Polo", typeValue: "Polos" }))).toEqual(["mens"])
    expect(inferAudiences(ctx({ title: "Womens Polo", typeValue: "Polos" }))).toEqual(["womens"])
    expect(inferAudiences(ctx({ title: "Kids Polo", typeValue: "Polos" }))).toEqual(["kids"])
  })

  it("falls back to unisex (mens + womens) when no demographic cue", () => {
    expect(
      inferAudiences(ctx({ title: "Premium Polo", typeValue: "Polos" })).sort()
    ).toEqual(["mens", "womens"])
  })

  it("adds workwear audience for workwear-source brand", () => {
    const audiences = inferAudiences(
      ctx({
        title: "Womens Polo",
        typeValue: "Polos",
        brandHandle: "syzmik",
      })
    )
    expect(audiences).toContain("workwear")
    expect(audiences).toContain("womens")
  })

  it("adds workwear audience for Hi-Viz title (without workwear brand)", () => {
    const audiences = inferAudiences(
      ctx({ title: "Mens Hi-Vis Polo", typeValue: "Polos" })
    )
    expect(audiences).toContain("workwear")
    expect(audiences).toContain("mens")
  })

  it("adds corporates audience for corporates-source brand", () => {
    const audiences = inferAudiences(
      ctx({
        title: "Womens Business Shirt",
        typeValue: "Shirts",
        brandHandle: "biz-corporates",
      })
    )
    expect(audiences).toContain("corporates")
    expect(audiences).toContain("womens")
  })

  it("detects workwear via Industrial tag", () => {
    expect(
      inferAudiences(
        ctx({
          title: "Heavy Duty Polo",
          typeValue: "Polos",
          tags: ["Industrial"],
        })
      )
    ).toContain("workwear")
  })
})

describe("resolveCategoryHandles — multi-audience cross-listing", () => {
  it("Hi-Viz Womens Polo from Syzmik lands in 3 categories", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Womens Hi-Vis Polo",
        typeValue: "Polos",
        brandHandle: "syzmik",
      })
    ).sort()
    expect(handles).toContain("womens-polos")
    expect(handles).toContain("workwear-polos")
    expect(handles).toContain("workwear-hi-viz-polos")
  })

  it("Biz Corporates Mens Business Shirt lands in corporates + mens", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Business Shirt",
        typeValue: "Shirts",
        brandHandle: "biz-corporates",
      })
    )
    expect(handles).toContain("corporates-business-shirts")
    expect(handles).toContain("mens-business-shirts")
  })

  it("Mens Pocket Tee lands in t-shirts + pocket-tees (cross-sub)", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Pocket Tee",
        typeValue: "T-Shirts",
      })
    )
    expect(handles).toContain("mens-t-shirts")
    expect(handles).toContain("mens-pocket-tees")
  })

  it("Mens V-Neck Tee lands in t-shirts + v-necks", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens V-Neck Tee",
        typeValue: "T-Shirts",
      })
    )
    expect(handles).toContain("mens-t-shirts")
    expect(handles).toContain("mens-v-necks")
  })

  it("Mens Active Polo lands in polos + active-polos (fit-driven)", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Active Polo",
        typeValue: "Polos",
      })
    )
    expect(handles).toContain("mens-polos")
    expect(handles).toContain("mens-active-polos")
  })

  it("Womens Active Polo from FashionBiz (with fit=Active tag) lands in polos + active-polos", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Womens Stencil Polo",
        typeValue: "Polos",
        tags: ["Active Fit"],
      })
    )
    expect(handles).toContain("womens-polos")
    expect(handles).toContain("womens-active-polos")
  })

  it("Mens Quarter Zip Hoodie lands in hoodies + quarter-zips", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Quarter Zip Hoodie",
        typeValue: "Hoodies",
      })
    )
    expect(handles).toContain("mens-hoodies")
    expect(handles).toContain("mens-quarter-zips")
  })

  it("Drill Shirt routes to workwear drill-shirts", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Drill Shirt",
        typeValue: "Shirts",
        brandHandle: "syzmik",
      })
    )
    expect(handles).toContain("workwear-drill-shirts")
  })

  it("Hi-Viz Drill Shirt cross-lists to workwear hi-viz-drill-shirts", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Hi-Vis Drill Shirt",
        typeValue: "Shirts",
        brandHandle: "syzmik",
      })
    )
    expect(handles).toContain("workwear-drill-shirts")
    expect(handles).toContain("workwear-hi-viz-drill-shirts")
  })

  it("Womens Skirt from Biz Corporates → corporates-skirts", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Womens A-Line Skirt",
        typeValue: "Skirts",
        brandHandle: "biz-corporates",
      })
    )
    expect(handles).toContain("corporates-skirts")
  })

  it("Mens Knit Cardigan from Biz Corporates → corporates-knitwear", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Knit Cardigan",
        typeValue: "Sweatshirts",
        brandHandle: "biz-corporates",
      })
    )
    expect(handles).toContain("corporates-knitwear")
  })

  it("Womens Softshell Jacket → softshell-jackets sub (not default)", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Womens Softshell Jacket",
        typeValue: "Jackets",
      })
    )
    expect(handles).toContain("womens-softshell-jackets")
  })

  it("Womens Rain Jacket → rain-jackets sub", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Womens Rain Jacket",
        typeValue: "Jackets",
      })
    )
    expect(handles).toContain("womens-rain-jackets")
    expect(handles).not.toContain("womens-softshell-jackets")
  })

  it("Womens Puffer Vest → puffer-vests sub", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Womens Puffer Vest",
        typeValue: "Jackets",
      })
    )
    expect(handles).toContain("womens-puffer-vests")
  })

  it("Long Sleeve Polo with hi-vis tag in workwear → long-sleeves + hi-viz-long-sleeves", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Hi-Vis Long Sleeve Polo",
        typeValue: "Longsleeves",
        brandHandle: "syzmik",
      })
    )
    expect(handles).toContain("workwear-long-sleeves")
    expect(handles).toContain("workwear-hi-viz-long-sleeves")
  })

  it("apron stays in accessories only (never picks up gender)", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Mens Apron",
        typeValue: "Aprons",
      })
    )
    expect(handles).toEqual(["accessories-aprons"])
  })

  it("kids products only get kids subs (no business-shirts)", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Kids Business Shirt",
        typeValue: "Shirts",
      })
    )
    // No "kids-business-shirts" — that sub doesn't exist in KIDS_SUBS
    expect(handles).not.toContain("kids-business-shirts")
    // Should fall back to nothing or casual-shirts (whichever KIDS_SUBS supports)
    // KIDS_SUBS doesn't have casual-shirts either, so should be empty
    expect(handles.length).toBe(0)
  })

  it("kids pocket tees DO exist (in KIDS_SUBS)", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Kids Pocket Tee",
        typeValue: "T-Shirts",
      })
    )
    expect(handles).toContain("kids-t-shirts")
    expect(handles).toContain("kids-pocket-tees")
  })

  it("unknown type stays empty", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "Some Mystery Item",
        typeValue: null,
      })
    )
    expect(handles).toEqual([])
  })

  it("DTF Auto Builder (Easy) — internal service stays unmapped", () => {
    const handles = resolveCategoryHandles(
      ctx({
        title: "DTF Auto Builder (Easy)",
        typeValue: null,
      })
    )
    expect(handles).toEqual([])
  })
})

describe("TREE structure invariants", () => {
  it("contains all 7 audiences", () => {
    const audienceHandles = TREE.map((t) => t.handle).sort()
    expect(audienceHandles).toEqual([
      "accessories",
      "corporates",
      "kids",
      "mens",
      "spirits",
      "womens",
      "workwear",
    ])
  })

  it("workwear has hi-viz variants for every base garment type", () => {
    const workwear = TREE.find((t) => t.handle === "workwear")!
    const subHandles = new Set(workwear.children.map((s) => s.handle))
    // For each non-hi-viz sub that's a "garment-like" type, expect a hi-viz variant
    const garmentBases = ["t-shirts", "polos", "long-sleeves", "hoodies", "crewnecks"]
    for (const base of garmentBases) {
      expect(subHandles.has(base)).toBe(true)
      expect(subHandles.has(`hi-viz-${base}`)).toBe(true)
    }
  })

  it("corporates has no hi-viz subs", () => {
    const corporates = TREE.find((t) => t.handle === "corporates")!
    const hiVizSubs = corporates.children.filter((s) =>
      s.handle.startsWith("hi-viz-")
    )
    expect(hiVizSubs.length).toBe(0)
  })

  it("mens and womens share identical sub list", () => {
    const mens = TREE.find((t) => t.handle === "mens")!
    const womens = TREE.find((t) => t.handle === "womens")!
    expect(mens.children.map((s) => s.handle).sort()).toEqual(
      womens.children.map((s) => s.handle).sort()
    )
  })
})
