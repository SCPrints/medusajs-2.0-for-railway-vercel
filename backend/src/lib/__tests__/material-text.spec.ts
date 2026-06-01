import { cleanMaterialString } from "../material-text"

describe("cleanMaterialString", () => {
  it("returns null for empty / nullish input", () => {
    expect(cleanMaterialString(null)).toBeNull()
    expect(cleanMaterialString(undefined)).toBeNull()
    expect(cleanMaterialString("")).toBeNull()
    expect(cleanMaterialString("   ")).toBeNull()
  })

  it("keeps a clean composition unchanged", () => {
    expect(cleanMaterialString("160gm 100% Polyester")).toBe("160gm 100% Polyester")
    expect(cleanMaterialString("Cotton Blend")).toBe("Cotton Blend")
    expect(
      cleanMaterialString("Mid weight, 100% cotton front and peak, 100% polyester mesh back")
    ).toBe("Mid weight, 100% cotton front and peak, 100% polyester mesh back")
  })

  it("truncates at 'Features:' (AP pattern)", () => {
    expect(
      cleanMaterialString(
        "160gm 100% Polyester Features: Mini waffle knit Dri-wear antibacterial finish Easy care fabric"
      )
    ).toBe("160gm 100% Polyester")
  })

  it("truncates at a feature phrase with no label (Ramo/AP pattern)", () => {
    expect(
      cleanMaterialString("320 gsm Polycotton brushed fleece Shoulder contrast")
    ).toBe("320 gsm Polycotton brushed fleece Shoulder contrast")
    // 'Dri-wear' is a hard feature boundary
    expect(
      cleanMaterialString("150gm 100% Polyester Dri-wear antibacterial finish")
    ).toBe("150gm 100% Polyester")
  })

  it("truncates at 'Wash-n-wear' / 'Size:' (DNC pattern)", () => {
    expect(
      cleanMaterialString(
        "200gsm 65% polyester 35% cotton, Wash-n-wear, pleat front. Sizes : 77R-112R"
      )
    ).toBe("200gsm 65% polyester 35% cotton")
    expect(
      cleanMaterialString("290gsm (10oz) heavy cotton drill Size : 85cm x 75cm")
    ).toBe("290gsm (10oz) heavy cotton drill")
  })

  it("collapses whitespace and trims trailing punctuation", () => {
    expect(cleanMaterialString("  200gsm   65% Polyester,  ")).toBe("200gsm 65% Polyester")
  })

  it("returns null when nothing meaningful remains", () => {
    expect(cleanMaterialString("Features: only feature text")).toBeNull()
  })
})
