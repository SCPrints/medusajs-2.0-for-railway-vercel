import {
  estimateScreenColoursFromImageData,
  isDarkGarmentColourName,
  quantiseImageDataToColours,
  type ImageDataLike,
} from "./estimate-screen-colours"

/** Build a WxH image where each pixel is picked by a callback. */
const image = (
  width: number,
  height: number,
  pick: (x: number, y: number) => [number, number, number, number]
): ImageDataLike => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pick(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { width, height, data }
}

describe("estimateScreenColoursFromImageData", () => {
  it("counts a two-colour flag as 2 spot colours", () => {
    const img = image(40, 40, (x) =>
      x < 20 ? [255, 0, 0, 255] : [255, 255, 255, 255]
    )
    const est = estimateScreenColoursFromImageData(img)
    expect(est.colours).toBe(2)
    expect(est.printable).toBe(true)
  })

  it("ignores transparent background entirely", () => {
    const img = image(40, 40, (x, y) =>
      x > 10 && x < 30 && y > 10 && y < 30 ? [0, 80, 200, 255] : [0, 0, 0, 0]
    )
    const est = estimateScreenColoursFromImageData(img)
    expect(est.colours).toBe(1)
    expect(est.printable).toBe(true)
  })

  it("ignores anti-aliasing noise under the coverage floor", () => {
    // Solid red with a one-pixel border of a blended edge colour (<2% coverage
    // after merging is not guaranteed, so make the edge genuinely tiny).
    const img = image(50, 50, (x, y) =>
      x === 0 && y < 2 ? [128, 64, 64, 255] : [255, 0, 0, 255]
    )
    const est = estimateScreenColoursFromImageData(img)
    expect(est.colours).toBe(1)
  })

  it("merges near-identical shades into one ink", () => {
    const img = image(40, 40, (x) =>
      x < 20 ? [200, 30, 30, 255] : [215, 45, 40, 255]
    )
    const est = estimateScreenColoursFromImageData(img)
    expect(est.colours).toBe(1)
  })

  it("flags a full gradient as not screen-printable", () => {
    const img = image(64, 64, (x, y) => [
      Math.round((x / 63) * 255),
      Math.round((y / 63) * 255),
      128,
      255,
    ])
    const est = estimateScreenColoursFromImageData(img)
    expect(est.printable).toBe(false)
  })

  it("caps the reported colour count at 6 and marks >6 unprintable", () => {
    // 8 distinct, well-separated colours in vertical stripes.
    const palette: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
      [30, 30, 30],
    ]
    const img = image(80, 40, (x) => {
      const [r, g, b] = palette[Math.min(7, Math.floor(x / 10))]
      return [r, g, b, 255]
    })
    const est = estimateScreenColoursFromImageData(img)
    expect(est.rawClusters).toBeGreaterThan(6)
    expect(est.colours).toBe(6)
    expect(est.printable).toBe(false)
  })
})

describe("quantiseImageDataToColours", () => {
  it("snaps every opaque pixel to the reduced palette", () => {
    const img = image(40, 40, (x) =>
      x < 15 ? [255, 0, 0, 255] : x < 30 ? [0, 0, 255, 255] : [10, 200, 10, 255]
    )
    const { data, palette } = quantiseImageDataToColours(img, 2)
    expect(palette).toHaveLength(2)
    // Every opaque output pixel must be one of the palette colours.
    const allowed = new Set(palette)
    for (let i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      const hex = `#${[data[i], data[i + 1], data[i + 2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`
      expect(allowed.has(hex)).toBe(true)
    }
  })

  it("preserves transparency", () => {
    const img = image(10, 10, (x) => (x < 5 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    const { data } = quantiseImageDataToColours(img, 1)
    expect(data[3]).toBe(255)
    expect(data[(0 * 10 + 9) * 4 + 3]).toBe(0)
  })
})

describe("isDarkGarmentColourName", () => {
  it("flags dark garment colours", () => {
    for (const name of ["Black", "Navy", "Forest Green", "Kelly Green", "Maroon", "Royal Blue", "Charcoal Marle"]) {
      expect(isDarkGarmentColourName(name)).toBe(true)
    }
  })
  it("passes light garment colours", () => {
    for (const name of ["White", "Natural", "Pale Pink", "Sky Blue", "Grey Marle", "Butter"]) {
      expect(isDarkGarmentColourName(name)).toBe(false)
    }
  })
  it("defaults to not-dark when unknown", () => {
    expect(isDarkGarmentColourName("Fiesta")).toBe(false)
    expect(isDarkGarmentColourName(null)).toBe(false)
  })
})
