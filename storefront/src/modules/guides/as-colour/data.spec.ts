import { cutOf, fitClass, weightBand } from "./data"

describe("AS Colour guide classification", () => {
  it("bands weight the way AS Colour labels it", () => {
    expect(weightBand(160)).toBe("light")
    expect(weightBand(180)).toBe("mid")
    expect(weightBand(200)).toBe("mid")
    expect(weightBand(220)).toBe("heavy")
    expect(weightBand(280)).toBe("heavy")
    expect(weightBand(null)).toBeNull()
  })

  it("lets a cut named in the title win over the fit tip", () => {
    expect(fitClass("Wo's Crop Tee", "Relaxed fit")).toBe("cropped")
    expect(fitClass("Classic Oversized Tee", null)).toBe("oversized")
    expect(fitClass("Box Tee", null)).toBe("oversized")
    expect(fitClass("Heavy Tee", "Relaxed fit")).toBe("relaxed")
    expect(fitClass("Staple Tee", "Regular fit")).toBe("regular")
    expect(fitClass("Block Tee", null)).toBe("regular")
  })

  it("splits womens from mens by the Wo's prefix only", () => {
    expect(cutOf("Wo's Maple Tee")).toBe("womens")
    expect(cutOf("Staple Tee")).toBe("mens")
  })
})
