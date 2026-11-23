import { fullSizeAsColourUrl } from "../ascolour-image-size"

const base = "https://cdn11.bigcommerce.com/s-lqiq2tqil5/products/1158/images/19560/"

describe("fullSizeAsColourUrl", () => {
  it("swaps the 386×513 resize for the 1280×1280 one, keeping the query", () => {
    expect(fullSizeAsColourUrl(`${base}5086_HEAVY_FADED_MINUS_TEE_FADED_BROWN__58904.1786493365.386.513.jpg?c=1`)).toBe(
      `${base}5086_HEAVY_FADED_MINUS_TEE_FADED_BROWN__58904.1786493365.1280.1280.jpg?c=1`
    )
  })

  it("leaves full-size links and other hosts alone", () => {
    expect(fullSizeAsColourUrl(`${base}5086_X__1.1.1280.1280.jpg?c=1`)).toBeNull()
    expect(fullSizeAsColourUrl("https://example.com/a.386.513.jpg")).toBeNull()
  })
})
