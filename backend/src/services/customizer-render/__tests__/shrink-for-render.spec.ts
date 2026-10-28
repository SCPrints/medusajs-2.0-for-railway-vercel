import sharp from "sharp"

import { shrinkForRender } from "../service"

describe("shrinkForRender", () => {
  it("shrinks a 600 dpi A3 original to the render cap, keeping aspect", async () => {
    const big = await sharp({
      create: { width: 8976, height: 11339, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer()
    const { buffer, contentType } = await shrinkForRender(big, "image/png")
    const meta = await sharp(buffer).metadata()
    expect(contentType).toBe("image/png")
    expect(meta.height).toBe(3000)
    expect(meta.width).toBe(Math.round((8976 / 11339) * 3000))
    expect(meta.hasAlpha).toBe(true)
  }, 60_000)

  it("leaves small images and SVGs alone", async () => {
    const small = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer()
    expect((await shrinkForRender(small, "image/png")).buffer).toBe(small)
    const svg = Buffer.from("<svg/>")
    expect((await shrinkForRender(svg, "image/svg+xml")).buffer).toBe(svg)
  })
})
