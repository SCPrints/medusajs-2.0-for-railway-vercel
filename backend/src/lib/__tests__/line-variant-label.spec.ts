import { lineVariantLabel } from "../line-variant-label"

describe("lineVariantLabel", () => {
  it("shows the colour / size of an online-order line", () => {
    expect(lineVariantLabel("Supply Hood", "BLACK / XL")).toBe("BLACK / XL")
  })

  it("adds nothing when the title already carries it (quote lines)", () => {
    expect(lineVariantLabel("Chad Polo — COAL / 2XL", "COAL / 2XL")).toBe("")
    expect(lineVariantLabel("Access Cap – BONE / One Size", "BONE / One Size")).toBe("")
  })

  it("skips placeholder and missing variants", () => {
    expect(lineVariantLabel("Embroidery digitising", "Default variant")).toBe("")
    expect(lineVariantLabel("Artwork upscale", "Standard")).toBe("")
    expect(lineVariantLabel("Setup fee", null)).toBe("")
    expect(lineVariantLabel("Setup fee", "  ")).toBe("")
  })
})
