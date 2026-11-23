import { alphaBoundingBox, worthTrimming } from "./trim-transparent"

/** w × h RGBA, opaque only inside the given box. */
const image = (w: number, h: number, box?: { x: number; y: number; width: number; height: number }) => {
  const data = new Uint8ClampedArray(w * h * 4)
  if (box) {
    for (let y = box.y; y < box.y + box.height; y++) {
      for (let x = box.x; x < box.x + box.width; x++) data[(y * w + x) * 4 + 3] = 255
    }
  }
  return data
}

describe("alphaBoundingBox", () => {
  it("finds a small logo on a big transparent Canva page", () => {
    const box = { x: 30, y: 40, width: 20, height: 10 }
    expect(alphaBoundingBox(image(100, 140, box), 100, 140)).toEqual(box)
    expect(worthTrimming(box, 100, 140)).toBe(true)
  })
  it("ignores near-invisible pixels", () => {
    const data = image(10, 10, { x: 2, y: 2, width: 3, height: 3 })
    data[(9 * 10 + 9) * 4 + 3] = 5
    expect(alphaBoundingBox(data, 10, 10)).toEqual({ x: 2, y: 2, width: 3, height: 3 })
  })
  it("leaves full-bleed and empty images alone", () => {
    const full = { x: 0, y: 0, width: 100, height: 100 }
    expect(worthTrimming(alphaBoundingBox(image(100, 100, full), 100, 100), 100, 100)).toBe(false)
    expect(alphaBoundingBox(image(10, 10), 10, 10)).toBeNull()
    expect(worthTrimming(null, 10, 10)).toBe(false)
  })
})
