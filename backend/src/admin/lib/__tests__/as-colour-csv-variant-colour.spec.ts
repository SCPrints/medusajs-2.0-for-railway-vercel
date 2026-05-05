import {
  colourFromVariantTitle,
  resolveVariantColourFromCsvRow,
} from "../as-colour-csv-variant-colour"

describe("as-colour-csv-variant-colour", () => {
  it("colourFromVariantTitle returns text after last ` / `", () => {
    expect(colourFromVariantTitle("XS / BLACK")).toBe("BLACK")
    expect(colourFromVariantTitle("2XL / LIGHT GREY")).toBe("LIGHT GREY")
  })

  it("resolveVariantColourFromCsvRow uses Colour option when present", () => {
    expect(
      resolveVariantColourFromCsvRow({
        "variant option 1 name": "Colour",
        "variant option 1 value": "NAVY",
      })
    ).toBe("NAVY")
  })

  it("resolveVariantColourFromCsvRow uses Variant Title when Size × Colour and option 2 empty", () => {
    expect(
      resolveVariantColourFromCsvRow({
        "variant option 1 name": "Size",
        "variant option 1 value": "XS",
        "variant option 2 name": "",
        "variant option 2 value": "",
        "variant title": "XS / BLACK",
      })
    ).toBe("BLACK")
  })
})
