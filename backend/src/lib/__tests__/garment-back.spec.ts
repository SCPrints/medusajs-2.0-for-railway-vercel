import { isGarmentBackKind, parseGarmentHex, recolourShading } from "../garment-back"

const px = (grey: number, alpha: number) => Uint8Array.from([grey, grey, grey, alpha])
const FABRIC = Math.round(0.94 * 255) // flat fabric tone in the shading maps

describe("garment-back", () => {
  it("parses colours, defaulting to near-white", () => {
    expect(parseGarmentHex("1f2a44")).toEqual([31, 42, 68])
    expect(parseGarmentHex("#B3202A")).toEqual([179, 32, 42])
    expect(parseGarmentHex("hsl(1 2% 3%)")).toEqual([244, 244, 244])
    expect(parseGarmentHex(undefined)).toEqual([244, 244, 244])
  })

  it("only knows the shipped garments", () => {
    expect(isGarmentBackKind("hood")).toBe(true)
    expect(isGarmentBackKind("../../etc/passwd")).toBe(false)
  })

  it.each([
    [[179, 32, 42]],
    [[31, 42, 68]],
    [[17, 24, 39]],
    [[244, 244, 244]],
  ] as Array<[[number, number, number]]>)("flat fabric comes out as the colour %j", (rgb) => {
    const out = recolourShading(px(FABRIC, 255), 4, rgb)
    expect(Math.abs(out[0] - rgb[0])).toBeLessThanOrEqual(2)
    expect(Math.abs(out[1] - rgb[1])).toBeLessThanOrEqual(2)
    expect(Math.abs(out[2] - rgb[2])).toBeLessThanOrEqual(2)
    expect(out[3]).toBe(255)
  })

  it("keeps folds visible on black and leaves the background transparent", () => {
    const black: [number, number, number] = [17, 24, 39]
    const fold = recolourShading(px(200, 255), 4, black)
    const sheen = recolourShading(px(255, 255), 4, black)
    expect(sheen[0] - fold[0]).toBeGreaterThan(25)
    expect(recolourShading(px(0, 0), 4, black)[3]).toBe(0)
  })
})
