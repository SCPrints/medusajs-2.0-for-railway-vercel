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

describe("withRenderSlot", () => {
  it("never runs more than two jobs at once and runs them all", async () => {
    const { withRenderSlot } = await import("../service")
    let running = 0
    let peak = 0
    const job = (ms: number) => () =>
      new Promise<number>((resolve) => {
        running++
        peak = Math.max(peak, running)
        setTimeout(() => {
          running--
          resolve(ms)
        }, ms)
      })
    const results = await Promise.all([30, 10, 20, 5, 15, 25].map((ms) => withRenderSlot(job(ms))))
    expect(results).toEqual([30, 10, 20, 5, 15, 25])
    expect(peak).toBe(2)
  })
})
