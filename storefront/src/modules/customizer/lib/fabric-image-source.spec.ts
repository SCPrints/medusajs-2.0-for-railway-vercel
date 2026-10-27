import { fitImageToSource } from "./fabric-image-source"

const fakeImage = (props: Record<string, number>, natural: { width: number; height: number }) => ({
  cropX: 0,
  cropY: 0,
  ...props,
  getOriginalSize: () => natural,
  set(next: Record<string, number>) {
    Object.assign(this, next)
  },
})

describe("fitImageToSource", () => {
  it("resizes a 2000px canvas copy to its 4200px original without changing on-canvas size (order #118)", () => {
    const img: any = fakeImage({ width: 2000, height: 2000, scaleX: 0.043, scaleY: 0.0431 }, { width: 4200, height: 4200 })
    fitImageToSource({}, img)
    expect(img.width).toBe(4200)
    expect(img.width * img.scaleX).toBeCloseTo(2000 * 0.043)
    expect(img.height * img.scaleY).toBeCloseTo(2000 * 0.0431)
    expect(img.sourceWidthPx).toBe(4200)
  })

  it("leaves matching images, real crops and non-images alone", () => {
    const same: any = fakeImage({ width: 1500, height: 1000, scaleX: 0.5, scaleY: 0.5 }, { width: 1500, height: 1000 })
    fitImageToSource({}, same)
    expect(same.scaleX).toBe(0.5)

    const cropped: any = fakeImage({ width: 100, height: 100, scaleX: 1, scaleY: 1, cropX: 10 }, { width: 400, height: 400 })
    fitImageToSource({}, cropped)
    expect(cropped.width).toBe(100)

    expect(() => fitImageToSource({}, { type: "IText" })).not.toThrow()
    expect(() => fitImageToSource({}, undefined)).not.toThrow()
  })
})
