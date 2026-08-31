import { buildSuggestedName, collectOrderDriveFiles } from "../route"

describe("buildSuggestedName", () => {
  it("joins company, person, and display id", () => {
    expect(
      buildSuggestedName({
        display_id: 79,
        billing_address: {
          company: "SC PRINTS",
          first_name: "Sean",
          last_name: "Mudie",
        },
      })
    ).toBe("SC PRINTS | Sean Mudie | 79")
  })

  it("drops company when absent", () => {
    expect(
      buildSuggestedName({
        display_id: 12,
        billing_address: { company: "  ", first_name: "Jo", last_name: "Steele" },
      })
    ).toBe("Jo Steele | 12")
  })

  it("falls back to shipping address then email", () => {
    expect(
      buildSuggestedName({
        display_id: 3,
        billing_address: null,
        shipping_address: { company: "ALS" },
        email: "jo@example.com",
      })
    ).toBe("ALS | jo@example.com | 3")
  })
})

describe("collectOrderDriveFiles", () => {
  const design = (over: Record<string, unknown> = {}) => ({
    customizerDesign: {
      type: "fabric_customizer",
      artifacts: [
        {
          side: "front",
          mockupUrl: "https://r2.example/mock-front.png",
          printUrl: "https://r2.example/print-front.png",
        },
      ],
      customerOriginalFiles: [
        {
          url: "https://r2.example/logo.svg",
          fileName: "logo.svg",
          mimeType: "image/svg+xml",
        },
      ],
      group_id: "g1",
      ...over,
    },
  })

  it("collects originals and mockups from a customizer line", () => {
    const files = collectOrderDriveFiles([
      { id: "li_1", product_title: "Heavy Tee", metadata: design() },
    ])
    expect(files).toEqual([
      { url: "https://r2.example/logo.svg", name: "logo.svg", mime: "image/svg+xml" },
      {
        url: "https://r2.example/mock-front.png",
        name: "Mockup - Heavy Tee - Front.png",
        mime: "image/png",
      },
    ])
  })

  it("dedupes across size lines sharing one design group", () => {
    const files = collectOrderDriveFiles([
      { id: "li_1", product_title: "Heavy Tee", variant_title: "Black / M", metadata: design() },
      { id: "li_2", product_title: "Heavy Tee", variant_title: "Black / L", metadata: design() },
    ])
    expect(files).toHaveLength(2)
  })

  it("skips data: URLs and lines without customizer metadata", () => {
    const files = collectOrderDriveFiles([
      { id: "li_1", product_title: "Plain Tee", metadata: null },
      {
        id: "li_2",
        product_title: "Heavy Tee",
        metadata: design({
          artifacts: [{ side: "front", mockupUrl: "data:image/png;base64,AAAA" }],
          customerOriginalFiles: [],
        }),
      },
    ])
    expect(files).toEqual([])
  })

  it("suffixes colliding file names", () => {
    const files = collectOrderDriveFiles([
      { id: "li_1", product_title: "Tee", metadata: design() },
      {
        id: "li_2",
        product_title: "Tee",
        metadata: design({
          group_id: "g2",
          artifacts: [],
          customerOriginalFiles: [
            { url: "https://r2.example/other.svg", fileName: "logo.svg", mimeType: "image/svg+xml" },
          ],
        }),
      },
    ])
    expect(files.map((f) => f.name)).toContain("logo (2).svg")
  })
})
