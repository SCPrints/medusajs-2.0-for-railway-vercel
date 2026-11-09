jest.mock("./upload-customer-original", () => ({
  uploadCustomerOriginalUnchanged: jest.fn(async () => "https://r2.example/hosted.png"),
}))

import { hostUnmappedDataUrls } from "./inline-raster-to-hosted"
import { sanitizeCustomizerDesignForCart } from "./sanitize-cart-metadata"

describe("hostUnmappedDataUrls", () => {
  it("hosts an unmapped canvas image so the save keeps it instead of omitting it", async () => {
    const big = `data:image/png;base64,${"A".repeat(400)}`
    const known = `data:image/png;base64,${"B".repeat(400)}`
    const design = { sideLayouts: [{ side: "back", objects: [{ src: big }, { src: known }] }] }
    const map: Record<string, string> = { [known]: "https://r2.example/known.png" }

    await hostUnmappedDataUrls(design, map)
    const saved = sanitizeCustomizerDesignForCart(design, map)

    expect(saved.sideLayouts[0].objects.map((o) => o.src)).toEqual([
      "https://r2.example/hosted.png",
      "https://r2.example/known.png",
    ])
  })
})
