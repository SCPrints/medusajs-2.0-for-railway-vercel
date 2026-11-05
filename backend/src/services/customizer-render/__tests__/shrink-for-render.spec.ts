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

  it("shrinks a big opaque photo to JPEG, small enough to inline in an SVG", async () => {
    // Noise, like a phone photo: as a 3000 px PNG this was ~7.5 MB and broke the SVG parse.
    const w = 4000
    const h = 3000
    const raw = Buffer.alloc(w * h * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24
    const photo = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer()
    const { buffer, contentType, shrunk } = await shrinkForRender(photo, "image/jpeg")
    const meta = await sharp(buffer).metadata()
    expect(shrunk).toBe(true)
    expect(contentType).toBe("image/jpeg")
    expect(meta.format).toBe("jpeg")
    expect(meta.width).toBe(3000)
    expect(Math.ceil(buffer.length / 3) * 4).toBeLessThan(10 * 1024 * 1024)
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
