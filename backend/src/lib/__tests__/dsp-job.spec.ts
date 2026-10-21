import { buildDspPack, parseSizeMm, type DspInput } from "../dsp-job"

const base = (): DspInput => ({
  poNumber: "1234",
  customer: "Mr Liquor",
  dueDate: "2026-10-30T00:00:00Z",
  products: { p1: { title: "Staple Tee 5001", brand: "AS Colour", type: "T-Shirts", supacolour: false } },
  state: {
    designs: [{ id: "d1", label: "A", imageUrl: "https://x/a.png", vectorUrl: "https://x/a.pdf" }],
    groups: [
      {
        id: "g1",
        product: { id: "p1", title: "Staple Tee 5001" },
        supplied: false,
        rows: [{ colour: "Black", label: "", dark: true, cells: { M: "150", S: "50", XL: "0" } }],
        positions: [
          { id: "a", side: "left_chest", method: "screen", designId: "d1", colours: "2", pms: ["White", "485C Red"], sizeMm: "100 x 100" },
          { id: "b", side: "back", method: "screen", designId: "d1", colours: "1", repeatJob: "J52350" },
          { id: "c", side: "right_sleeve", method: "print", designId: "d1", channel: "dtf" },
          { id: "e", side: "nape", method: "embroidery", designId: "d1" },
        ],
      },
    ],
  },
})

describe("buildDspPack", () => {
  it("keeps only DSP positions and lays them out like DSP's proof", () => {
    const [pack] = buildDspPack(base())
    expect(pack.pages.map((p) => p.positionLabel)).toEqual(["Left Chest", "Centre Back"])
    expect(pack.qty).toBe(200)
    const [lc, back] = pack.pages
    expect(lc.colourLines).toEqual(["1/3 BASE", "2/3 WHITE", "3/3 485C RED"])
    expect(lc.screens).toBe(3)
    expect(lc.printSize).toEqual({ widthMm: 100, heightMm: 100 })
    expect(lc.sizeLines).toEqual(["S - 50", "M - 150"])
    expect(back.repeatJob).toBe("J52350")
    expect(pack.warnings).toEqual([
      "Centre Back: no print size — enter it in the job pricer (mm, e.g. 280 x 189).",
      "Centre Back: 1 PMS colour(s) not entered.",
    ])
  })

  it("writes the printIQ block in DSP's wording", () => {
    const [pack] = buildDspPack(base())
    expect(pack.printiqText).toContain("JOB TITLE: Mr Liquor Black Staple Tee 5001 x 200. 2 pos")
    expect(pack.printiqText).toContain("DUE DATE: 30/10/26")
    expect(pack.printiqText).toContain("3 PMS Colours (PMS Refs - Base, White, 485C Red)")
    expect(pack.printiqText).toContain("Repeat Job screens - J52350,")
    expect(pack.printiqText).toContain("Screenprinting position to Left Chest,")
    expect(pack.printiqText).toContain("AS Colour T-Shirts - Staple Tee 5001 - Black: S x 50, M x 150")
  })

  it("uses the Studio-measured size when staff didn't type one, and picks up Supacolour", () => {
    const input = base()
    input.placements = { g1: { back: { widthMm: 280, heightMm: 189 } } }
    input.products.p1.supacolour = true
    input.state.groups[0].positions[2].channel = "auto"
    const [pack] = buildDspPack(input)
    expect(pack.pages[1].printSize).toEqual({ widthMm: 280, heightMm: 189 })
    expect(pack.pages[2]).toMatchObject({ positionLabel: "Right Sleeve", method: "transfer", screens: null, colourLines: ["1/1 SUPACOLOUR TRANSFER"] })
  })

  it("skips groups with no DSP work", () => {
    const input = base()
    input.state.groups[0].positions = [{ id: "c", side: "front", method: "print", designId: "d1", channel: "dtf" }]
    expect(buildDspPack(input)).toEqual([])
  })
})

describe("parseSizeMm", () => {
  it.each([
    ["280 x 189", { widthMm: 280, heightMm: 189 }],
    ["280×189mm", { widthMm: 280, heightMm: 189 }],
    ["100mm by 24", { widthMm: 100, heightMm: 24 }],
    ["A4", null],
    ["", null],
  ])("%s", (raw, want) => expect(parseSizeMm(raw)).toEqual(want))
})
