import { lineFiles } from "../open-carts"

describe("lineFiles", () => {
  it("lists mockups, print files and customer uploads, skipping empties", () => {
    const files = lineFiles(
      [
        { side: "front", printUrl: "https://r2/p.png", mockupUrl: "https://r2/m.jpg" },
        { side: "left_sleeve", printUrl: null, mockupUrl: "" },
      ],
      [{ url: "https://r2/o.png", fileName: "logo.png" }, { url: "" }]
    )
    expect(files).toEqual([
      { label: "Mockup (Front)", url: "https://r2/m.jpg" },
      { label: "Print file (Front)", url: "https://r2/p.png" },
      { label: "Customer upload: logo.png", url: "https://r2/o.png" },
    ])
  })

  it("tolerates missing/garbage jsonb", () => {
    expect(lineFiles(null, undefined)).toEqual([])
    expect(lineFiles("nope", 42)).toEqual([])
  })
})
