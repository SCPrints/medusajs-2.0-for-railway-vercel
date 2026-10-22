import { buildDspPack, countInkColours, inksFromNotes, parseSizeMm, parseWidthMm, positionLabel, type DspInput, type DspLine } from "../dsp-job"

// Shaped like order #116: AS Colour 5001 Grey Marle, screen front (2 col) + back (1 col).
const design = {
  group_id: "grp1",
  sideDecorationMethods: { front: "screen", back: "screen" },
  sideScreenConfigs: { front: { colours: 2, darkGarment: true }, back: { colours: 1, darkGarment: true } },
  artifacts: [
    { side: "front", printUrl: "https://x/front-print.png", mockupUrl: "https://x/front-mock.png" },
    { side: "back", printUrl: "https://x/back-print.png", mockupUrl: "https://x/back-mock.png" },
  ],
  customerOriginalFiles: [{ url: "https://x/logo.pdf", fileName: "logo.pdf", sides: ["front"] }],
}
const line = (id: string, size: string, quantity: number): DspLine => ({
  id,
  productId: "p1",
  productTitle: "AS Colour Staple Tee 5001",
  colour: "GREY MARLE",
  size,
  quantity,
  design,
  notes: "Screen print, white + green ink · Front left chest: lockup 130 mm wide",
})
const base = (): DspInput => ({
  poNumber: "116",
  customer: "OBC Brickwork",
  dueDate: "2026-10-30T00:00:00Z",
  lines: [line("l1", "XL", 20), line("l2", "L", 30), { ...line("setup", "Standard", 4), design: null }],
  products: { p1: { brand: "AS Colour", type: "T-Shirts", supacolour: false } },
  placements: { l1: [{ side: "front", widthMm: 130, heightMm: 60, offsetXMm: 70 }] },
  dimensions: { "l2:back": "20×30cm" },
  revisedMockups: { "l2:front": "https://x/revised-front.png" },
})

describe("buildDspPack (from an order)", () => {
  it("builds one job per design group from the order lines alone", () => {
    const packs = buildDspPack(base())
    expect(packs).toHaveLength(1)
    const [p] = packs
    expect(p.qty).toBe(50)
    expect(p.title).toBe("OBC Brickwork Grey Marle AS Colour Staple Tee 5001 x 50. 2 pos")
    const [front, back] = p.pages
    expect(front).toMatchObject({
      positionLabel: "Left Chest",
      colourLines: ["1/3 BASE", "2/3 WHITE", "3/3 GREEN"],
      screens: 3,
      printSize: { widthMm: 130, heightMm: 60 },
      sizeLines: ["L - 30", "XL - 20"],
      // Customer's own upload beats the (thumbnail) print render.
      artworkUrl: "https://x/logo.pdf",
      garmentImageUrl: "https://x/revised-front.png",
    })
    // Back: 1 colour, so it takes the first noted ink.
    expect(back).toMatchObject({ positionLabel: "Centre Back", inks: ["Base", "White"], printSize: { widthMm: 200, heightMm: 300 } })
    expect(p.artwork).toEqual([
      { position: "Left Chest", url: "https://x/logo.pdf", name: "logo.pdf" },
      { position: "Centre Back", url: "https://x/back-print.png", name: "back-print.png" },
    ])
    expect(p.sizesText).toBe("L 30 · XL 20 (50 total)")
    expect(p.warnings).toEqual(["Centre Back: only a low-resolution print file — attach the original artwork."])
  })

  it("prefers staff's revised proof artwork and honours a width-only typed size", () => {
    const input = base()
    input.revisedArtwork = { "l1:front": "https://x/fixed-logo.svg" }
    input.dimensions = { "l2:front": "130 mm Wide" }
    const [front] = buildDspPack(input)[0].pages
    expect(front.artworkUrl).toBe("https://x/fixed-logo.svg")
    // 130 wide, height kept in the placement's 130:60 proportion
    expect(front.printSize).toEqual({ widthMm: 130, heightMm: 60 })
  })

  it("skips DTF-only orders and includes Supacolour print sides", () => {
    const input = base()
    const dtf = { ...design, sideDecorationMethods: { front: "print" }, sideScreenConfigs: {} }
    input.lines = [{ ...line("l1", "M", 10), design: dtf }]
    expect(buildDspPack(input)).toEqual([])
    input.products.p1.supacolour = true
    expect(buildDspPack(input)[0].pages[0]).toMatchObject({ method: "transfer", colourLines: ["1/1 SUPACOLOUR TRANSFER"], screens: null })
  })
})

describe("helpers", () => {
  it.each([
    ["280 x 189", { widthMm: 280, heightMm: 189 }],
    ["8.75×3.5cm", { widthMm: 88, heightMm: 35 }],
    ["100mm by 24", { widthMm: 100, heightMm: 24 }],
    ["A4", null],
  ])("parseSizeMm %s", (raw, want) => expect(parseSizeMm(raw)).toEqual(want))

  it("parseWidthMm", () => {
    expect(parseWidthMm("130 mm Wide")).toBe(130)
    expect(parseWidthMm("13cm wide")).toBe(130)
    expect(parseWidthMm("280 x 189")).toBeNull()
  })

  it("reads ink names from staff notes", () => {
    expect(inksFromNotes("Screen print, white + green ink · Back")).toEqual(["White", "Green"])
    expect(inksFromNotes("black ink")).toEqual(["Black"])
    expect(inksFromNotes("Full colour DTF")).toEqual([])
  })

  it("names chest prints from the placement", () => {
    expect(positionLabel("front", { side: "front", widthMm: 90, heightMm: 40, offsetXMm: 70 })).toBe("Left Chest")
    expect(positionLabel("front", { side: "front", widthMm: 90, heightMm: 40, offsetXMm: -70 })).toBe("Right Chest")
    expect(positionLabel("front", { side: "front", widthMm: 280, heightMm: 300, offsetXMm: 0 })).toBe("Centre Front")
    expect(positionLabel("back")).toBe("Centre Back")
  })
})

describe("countInkColours", () => {
  // n pixels of one RGBA colour
  const px = (n: number, r: number, g: number, b: number, a = 255) => Array.from({ length: n }, () => [r, g, b, a]).flat()
  it("counts inks on transparency, ignoring soft edges and tiny specks", () => {
    // OBC back: white + a thin green divider on transparent, soft edges, a stray speck
    const img = [...px(900, 255, 255, 255), ...px(20, 89, 183, 145), ...px(500, 0, 0, 0, 0), ...px(30, 200, 200, 200, 120), ...px(2, 255, 0, 0)]
    expect(countInkColours(Uint8Array.from(img))).toBe(2)
  })
  it("drops the paper background and anti-aliased blends on opaque artwork", () => {
    const img = [...px(1000, 255, 255, 255), ...px(300, 0, 0, 0), ...px(40, 128, 128, 128)]
    expect(countInkColours(Uint8Array.from(img))).toBe(1)
  })
})
