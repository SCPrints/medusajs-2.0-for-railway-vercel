import sharp from "sharp"
import {
  chartBodyWidth,
  measurePhotoBodyRatio,
  mockupScaleFor,
  parseGildanSizingCsv,
  parseHtmlSizeTable,
  parseKiwiSizing,
  pickReferenceSize,
  readSizeChartImage,
  sleeveSafeRatio,
  toBodyWidthCm,
  widthFromTable,
} from "../garment-fit"

describe("pickReferenceSize", () => {
  it("prefers M, else the middle size", () => {
    expect(pickReferenceSize(["XS", "S", "M", "L"])).toBe("M")
    expect(pickReferenceSize(["XSM", "SML", "MED", "LRG"])).toBe("MED")
    expect(pickReferenceSize(["8", "10", "12", "14", "16"])).toBe("12")
    expect(pickReferenceSize([])).toBeNull()
  })
})

describe("toBodyWidthCm", () => {
  it("keeps flat widths, halves circumferences, rejects junk", () => {
    expect(toBodyWidthCm("52")).toBe(52)
    expect(toBodyWidthCm("104 cm")).toBe(52)
    expect(toBodyWidthCm("")).toBeNull()
    expect(toBodyWidthCm(12)).toBeNull()
  })
})

describe("widthFromTable", () => {
  it("reads the AS Colour Staple Tee chart (M = 52)", () => {
    const t = {
      header: ["MEASUREMENT", "XSM", "SML", "MED", "LRG", "XLG"],
      rows: [
        ["Body Width (cm)", "43", "47", "52", "56.5", "61"],
        ["Body Length (cm)", "68", "71", "75", "78.5", "82"],
      ],
    }
    expect(widthFromTable(t)).toEqual({ reference_size: "MED", body_width_cm: 52 })
  })

  it("prefers a 1/2 chest row and ignores 'to fit' rows", () => {
    const t = {
      header: ["", "S", "M", "L"],
      rows: [
        ["Chest to fit", "90", "96", "102"],
        ["1/2 Chest", "51", "54", "57"],
      ],
    }
    expect(widthFromTable(t)).toEqual({ reference_size: "M", body_width_cm: 54 })
  })

  it("returns null when there's no width row", () => {
    expect(widthFromTable({ header: ["", "M"], rows: [["Length", "74"]] })).toBeNull()
  })
})

describe("source parsers", () => {
  it("Gildan sizing_chart.csv", () => {
    const csv = [
      "parent_sku,size,width,length,Sleeve Length,inseam,relaxed waist,packaging,Size Chart Image",
      "5000,S,46,71,40,,,6,x.jpg",
      "5000,M,51,74,43,,,6,x.jpg",
      "5000,L,56,76,47,,,6,x.jpg",
      "48000,M,55,74,46,,,2,y.jpg",
    ].join("\n")
    const map = parseGildanSizingCsv(csv)
    expect(widthFromTable(map.get("5000"))).toEqual({ reference_size: "M", body_width_cm: 51 })
    expect(widthFromTable(map.get("48000"))?.body_width_cm).toBe(55)
  })

  it("Kiwi Sizing JSON (Aussie Pacific Cottesloe 1319, M = 55.5)", () => {
    const cell = (value: string) => ({ type: "single", value })
    const json = {
      sizings: [
        {
          tables: {
            a: {
              data: [
                ["SIZE", "S", "M", "L"].map(cell),
                ["CHEST", "53", "55.5", "58"].map(cell),
                ["LENGTH", "72", "74", "76"].map(cell),
              ],
            },
          },
        },
      ],
    }
    expect(widthFromTable(parseKiwiSizing(json))).toEqual({ reference_size: "M", body_width_cm: 55.5 })
  })

  it("JB's product-page table (1HT, M = 56)", () => {
    const html = `<table><thead><tr><th class='adults'>ADULTS</th>
      <th><abbr title='S'>S</abbr></th><th><abbr title='M'>M</abbr></th><th><abbr title='L'>L</abbr></th></tr></thead>
      <tbody><tr><th class='chest'><a href="/general/sizing-specifications">CHEST</a></th><td>53.5</td><td>56</td><td>58.5</td></tr>
      <tr><th><a>SP LENGTH</a></th><td>71.5</td><td>75.5</td><td>78.5</td></tr></tbody></table>`
    expect(widthFromTable(parseHtmlSizeTable(html))).toEqual({ reference_size: "M", body_width_cm: 56 })
  })

  it("DNC chart and type defaults by garment + audience", () => {
    expect(chartBodyWidth("dnc", { title: "Hi Vis Cotton Polo", type: "Polos" })).toEqual({ reference_size: "M", body_width_cm: 55.5 })
    expect(chartBodyWidth("dnc", { title: "Ladies Work Shirt", type: "Shirts" })).toEqual({ reference_size: "12", body_width_cm: 55 })
    expect(chartBodyWidth("type_default", { title: "Kids Tee", type: "T-Shirts" })).toEqual({ reference_size: "8", body_width_cm: 40 })
    expect(chartBodyWidth("type_default", { title: "Pullover", type: "Hoodies" })?.body_width_cm).toBe(58)
    expect(chartBodyWidth("dnc", { title: "Cotton Socks - 3 pair pack", type: "Socks" })).toBeNull()
    expect(chartBodyWidth("type_default", { title: "Trucker Cap", type: "Caps" })).toBeNull()
    expect(chartBodyWidth("type_default", { title: "Canvas Pennant Flag", type: null })).toBeNull()
    expect(chartBodyWidth("type_default", { title: "Organic Infant Wee Tee", type: "T-Shirts" })?.body_width_cm).toBe(40)
  })
})

// First call downloads the chart image, second is the Messages API.
const fakeFetch = (apiBody: unknown) =>
  (async (url: string) =>
    url.includes("api.anthropic.com")
      ? { ok: true, json: async () => apiBody }
      : { ok: true, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as typeof fetch

describe("readSizeChartImage", () => {
  it("turns the model's JSON into a width table", async () => {
    const fetchImpl = fakeFetch({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ sizes: ["S", "M"], body_width_cm: [47, 52], measurement_label: "Body Width (cm)" }) }],
    })
    const t = await readSizeChartImage("https://x/chart.jpg", { apiKey: "k", fetchImpl })
    expect(widthFromTable(t)).toEqual({ reference_size: "M", body_width_cm: 52 })
  })

  it("returns null on a refusal", async () => {
    const fetchImpl = fakeFetch({ stop_reason: "refusal", content: [] })
    expect(await readSizeChartImage("https://x/c.jpg", { apiKey: "k", fetchImpl })).toBeNull()
  })
})

// A "flat-lay": white background, dark rectangle (body) with wider sleeves at the top.
const flatLay = async (w: number, h: number, body: { x: number; y: number; w: number; h: number }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#ffffff"/>
    <rect x="${body.x - body.w * 0.4}" y="${body.y}" width="${body.w * 1.8}" height="${body.h * 0.25}" fill="#222"/>
    <rect x="${body.x}" y="${body.y}" width="${body.w}" height="${body.h}" fill="#222"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe("measurePhotoBodyRatio", () => {
  it("measures the body (not the sleeves) after the 4:5 cover crop", async () => {
    // Square 1000px photo, body 500px wide. Cover into 4:5 scales by 1.25/1000
    // per px → 500 × 1.25 / 1000 = 0.625 of canvas width.
    const img = await flatLay(1000, 1000, { x: 250, y: 150, w: 500, h: 700 })
    const ratio = await measurePhotoBodyRatio(img)
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(0.65)
  })

  it("rejects a model shot (garment runs off the bottom edge)", async () => {
    const img = await flatLay(1000, 1000, { x: 250, y: 150, w: 500, h: 850 })
    expect(await measurePhotoBodyRatio(img)).toBeNull()
  })
})

describe("mockupScaleFor", () => {
  it("AS Colour 5086: 65.1% of canvas vs 59 cm Large → 0.62", () => {
    expect(mockupScaleFor(0.651, 59)).toBeCloseTo(0.617, 3)
  })
  it("refuses implausible results", () => {
    expect(mockupScaleFor(0.9, 30)).toBeNull()
    expect(mockupScaleFor(null, 52)).toBeNull()
  })
})

describe("sleeveSafeRatio", () => {
  it("keeps a plausible long-sleeve reading", () => {
    expect(sleeveSafeRatio(0.66, 0.63)).toEqual({ ratio: 0.66, from: "photo" })
  })
  it("swaps a reading inflated by sleeves for the brand's typical photo", () => {
    expect(sleeveSafeRatio(0.92, 0.63)).toEqual({ ratio: 0.63, from: "brand_median" })
    expect(sleeveSafeRatio(null, 0.63)).toEqual({ ratio: 0.63, from: "brand_median" })
  })
  it("leaves it alone when the brand has no typical", () => {
    expect(sleeveSafeRatio(0.92, null)).toEqual({ ratio: 0.92, from: "photo" })
  })
})
