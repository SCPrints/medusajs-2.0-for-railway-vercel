import sharp from "sharp"
import { renderMockupAsset, scaledOverlayBox } from "../service"
import { renderRequestSchema } from "../types"

// No upload → data URL result. constants.ts reads env at import time, so
// deleting MINIO_ENDPOINT in a hook is too late when backend/.env sets it.
jest.mock("../../../lib/constants", () => ({
  ...jest.requireActual("../../../lib/constants"),
  MINIO_ENDPOINT: undefined,
}))

// Full-canvas red artwork on a 200×250 canvas, no garment photo (grey base).
const W = 200
const H = 250
const payload = (artworkScale?: number) => ({
  side: "front" as const,
  artworkSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ff0000"/></svg>`,
  garmentImageUrl: null,
  placement: { x: 0, y: 0, width: W, height: H },
  canvas: { width: W, height: H },
  artworkScale,
})

const pixel = async (dataUrl: string, x: number, y: number) => {
  const buf = Buffer.from(dataUrl.split(",")[1], "base64")
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}
const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60

describe("mockup artwork scale", () => {
  it("scales about the garment centre line and the top of the print zone", () => {
    expect(scaledOverlayBox(200, 250, 0.5)).toEqual({ left: 50, top: 16, width: 100, height: 125 })
    expect(scaledOverlayBox(200, 250, 1)).toEqual({ left: 0, top: 0, width: 200, height: 250 })
  })

  it("leaves the mockup unchanged without a scale", async () => {
    const { url } = await renderMockupAsset(payload())
    expect(isRed(await pixel(url, 5, 5))).toBe(true)
  })

  it("shrinks the artwork in the mockup when a scale is given", async () => {
    const { url } = await renderMockupAsset(payload(0.5))
    expect(isRed(await pixel(url, 5, 5))).toBe(false) // corner now garment
    expect(isRed(await pixel(url, 100, 80))).toBe(true) // inside the 50..150 × 16..141 box
    expect(isRed(await pixel(url, 100, 200))).toBe(false) // below it
  })

  it("schema bounds artworkScale to 0.3–1", () => {
    expect(renderRequestSchema.safeParse(payload(0.62)).success).toBe(true)
    expect(renderRequestSchema.safeParse(payload(0.1)).success).toBe(false)
    expect(renderRequestSchema.safeParse(payload(1.5)).success).toBe(false)
  })
})
