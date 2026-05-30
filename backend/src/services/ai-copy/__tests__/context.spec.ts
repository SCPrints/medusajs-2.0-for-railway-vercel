import { pickDraftByLength, productToContext } from "../context"

describe("pickDraftByLength", () => {
  const drafts = [
    { label: "Short", body: "one liner" },
    { label: "Standard", body: "two sentences here" },
    { label: "Detailed", body: "three paragraphs worth" },
  ]

  it("matches by label substring, case-insensitively", () => {
    expect(pickDraftByLength(drafts, "short")).toBe("one liner")
    expect(pickDraftByLength(drafts, "standard")).toBe("two sentences here")
    expect(pickDraftByLength(drafts, "detailed")).toBe("three paragraphs worth")
  })

  it("falls back to the middle draft when the label is absent", () => {
    const unlabelled = [
      { label: "Draft", body: "a" },
      { label: "Draft", body: "b" },
      { label: "Draft", body: "c" },
    ]
    expect(pickDraftByLength(unlabelled, "short")).toBe("b")
  })

  it("falls back to the first non-empty draft when there's no middle", () => {
    expect(pickDraftByLength([{ label: "x", body: "only" }], "detailed")).toBe(
      "only"
    )
  })

  it("returns null for an empty draft list", () => {
    expect(pickDraftByLength([], "standard")).toBeNull()
  })

  it("trims the chosen body", () => {
    expect(
      pickDraftByLength([{ label: "Standard", body: "  padded  " }], "standard")
    ).toBe("padded")
  })
})

describe("productToContext", () => {
  it("maps graph fields and only surfaces safe metadata", () => {
    const ctx = productToContext({
      title: "Classic Tee",
      handle: "classic-tee",
      description: "old copy",
      weight: 180,
      metadata: { fabric: "100% cotton", cost_price: 999, gsm: 180 },
      type: { value: "T-Shirts" },
      tags: [{ value: "Mens" }, { value: "Cotton" }],
      variants: [{ title: "S / Black" }, { title: "M / Black" }],
      brand: { name: "AS Colour", handle: "as-colour" },
    })

    expect(ctx.title).toBe("Classic Tee")
    expect(ctx.brand_name).toBe("AS Colour")
    expect(ctx.type_value).toBe("T-Shirts")
    expect(ctx.weight_grams).toBe(180)
    expect(ctx.tags).toEqual(["Mens", "Cotton"])
    expect(ctx.variant_titles).toEqual(["S / Black", "M / Black"])
    // safe metadata only — never pricing-sensitive keys
    expect(ctx.safe_metadata).toMatchObject({ fabric: "100% cotton", gsm: 180 })
    expect(ctx.safe_metadata).not.toHaveProperty("cost_price")
  })

  it("folds an operator hint into safe metadata", () => {
    const ctx = productToContext({ title: "Hoodie" }, "winter casual")
    expect(ctx.safe_metadata?.hint).toBe("winter casual")
  })

  it("handles array-wrapped brand and missing optionals", () => {
    const ctx = productToContext({
      title: "Bag",
      brand: [{ name: "Gildan", handle: "gildan" }],
    })
    expect(ctx.brand_name).toBe("Gildan")
    expect(ctx.weight_grams).toBeNull()
    expect(ctx.tags).toBeNull()
  })
})
