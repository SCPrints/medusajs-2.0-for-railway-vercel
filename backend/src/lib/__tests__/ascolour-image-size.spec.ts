import { fullSizeAsColourUrl, shotKey } from "../ascolour-image-size"

const base = "https://cdn11.bigcommerce.com/s-lqiq2tqil5/products/1158/images/"

// Real 5086 API records (2026-11-23): Faded Brown front was re-shot as 79055.
const api = [
  { urlZoom: `${base}30086/5086_HEAVY_FADED_MINUS_TEE_FADED_BROWN__79055.1793824964.1280.1280.jpg?c=1` },
  { urlZoom: `${base}30079/5086_HEAVY_FADED_MINUS_TEE_FADED_BROWN_BACK__43268.1793824964.1280.1280.jpg?c=1` },
  { urlZoom: `${base}25558/5086_HEAVY_FADED_MINUS_TEE_FADED_BONE_BACK__88781.1786493365.1280.1280.jpg?c=1` },
]

describe("fullSizeAsColourUrl", () => {
  it("uses the API's full-size link for the same image id", () => {
    expect(
      fullSizeAsColourUrl(`${base}25558/5086_HEAVY_FADED_MINUS_TEE_FADED_BONE_BACK__88781.1786493365.386.513.jpg?c=1`, api)
    ).toBe(api[2].urlZoom)
  })

  it("uses the current photo of the same shot when AS Colour re-shot the colour", () => {
    expect(
      fullSizeAsColourUrl(`${base}29978/5086_HEAVY_FADED_MINUS_TEE_FADED_BROWN__58904.1786493365.386.513.jpg?c=1`, api)
    ).toBe(api[0].urlZoom) // front, not the BROWN_BACK shot
  })

  it("leaves full-size links, other hosts and unmatched shots alone", () => {
    expect(fullSizeAsColourUrl(api[0].urlZoom, api)).toBeNull()
    expect(fullSizeAsColourUrl("https://example.com/a.386.513.jpg", api)).toBeNull()
    expect(fullSizeAsColourUrl(`${base}1/5086_HEAVY_FADED_MINUS_TEE_FADED_OLIVE__1.1.386.513.jpg?c=1`, api)).toBeNull()
  })
})

describe("shotKey", () => {
  it("matches a website photo to the API link of the same colour + view", () => {
    expect(
      shotKey("https://cdn11.bigcommerce.com/s-hsi95a83fz/images/stencil/1500w/products/1/2/5086_HEAVY_FADED_MINUS_TEE_FADED_CHALK__53155.1793827324.jpg")
    ).toBe(shotKey(`${base}29979/5086_HEAVY_FADED_MINUS_TEE_FADED_CHALK__70328.1786493365.386.513.jpg?c=1`))
    expect(shotKey(`${base}1/5086_X_FADED_CHALK_BACK__1.1.386.513.jpg`)).not.toBe(shotKey(`${base}1/5086_X_FADED_CHALK__1.1.386.513.jpg`))
  })
})
