import {
  buildGildanGarmentImages,
  cleanTitle,
  compareSizeCodes,
  groupRowsByStyle,
  handleForGildanProduct,
  isActiveStatus,
  parseGildanRow,
  renderGildanDescription,
} from "../mapping"
import { extractImageUrlsFromGildanHtml } from "../image-scraper"
import {
  GildanSitemapResolver,
  parseGildanSitemap,
} from "../sitemap-resolver"
import { priceLadderFromGildan, resolveGildanCost } from "../pricing"
import type { GildanColour, GildanProduct, GildanRow } from "../types"

function makeRawRow(overrides: Record<number, unknown> = {}): unknown[] {
  // 47-column positional template with defaults that produce a valid row.
  const base: unknown[] = new Array(47).fill(null)
  base[0] = "10W0M9L2X0"
  base[1] = "American Apparel"
  base[2] = 102
  base[3] = "102 AA WOMENS FINE JERSEY BOXY T-SHIRT BLUSH 2XLARGE"
  base[4] = "American Apparel Women's Fine Jersey Boxy T-Shirt"
  base[5] = "COLOUR"
  base[6] = "2XLARGE"
  base[7] = "2XL"
  base[8] = "Womens"
  base[9] = "Boxy Fit"
  base[10] = "100% Ring Spun Cotton"
  base[11] = "146g/m²"
  base[14] = "Made from ring spun cotton, Soft ring spun fabric, Non-topstitched"
  base[15] = "Apparel"
  base[16] = "Ladies"
  base[17] = "T-Shirt"
  base[18] = "Crew Neck"
  base[19] = "Blush"
  base[20] = "#CCA1A6"
  base[22] = "102_Blush_01.jpg"
  base[23] = "102_Blush_01.jpg"
  base[24] = "102_Blush_02.jpg"
  base[25] = "102_Blush_03.jpg"
  base[26] = "102_Blush_04.jpg"
  base[27] = "102_Blush_05.jpg"
  base[31] = 29.95
  base[32] = 7.25
  base[33] = 7.75
  base[34] = 8.25
  base[35] = "https://gildanbrands.com.au/american-apparel-102/"
  base[36] = "Active"
  base[38] = 14.9032
  base[46] = "GT"
  for (const [i, v] of Object.entries(overrides)) {
    base[Number(i)] = v
  }
  return base
}

describe("parseGildanRow", () => {
  it("parses a complete row into a typed shape", () => {
    const r = parseGildanRow(makeRawRow())
    expect(r).not.toBeNull()
    expect(r!.vendorSkuChild).toBe("10W0M9L2X0")
    expect(r!.brand).toBe("American Apparel")
    expect(r!.styleParent).toBe("102")
    expect(r!.colourName).toBe("Blush")
    expect(r!.hex).toBe("#CCA1A6")
    expect(r!.heroImageFilename).toBe("102_Blush_01.jpg")
    expect(r!.viewSrcFilenames).toEqual([
      "102_Blush_01.jpg",
      "102_Blush_02.jpg",
      "102_Blush_03.jpg",
      "102_Blush_04.jpg",
      "102_Blush_05.jpg",
    ])
    expect(r!.classicCost).toBe(8.25)
    expect(r!.status).toBe("Active")
  })

  it("stringifies numeric styleParent", () => {
    const r = parseGildanRow(makeRawRow({ 2: 64000 }))
    expect(r!.styleParent).toBe("64000")
  })

  it("drops rows missing critical fields", () => {
    expect(parseGildanRow(makeRawRow({ 0: null }))).toBeNull()
    expect(parseGildanRow(makeRawRow({ 1: "" }))).toBeNull()
    expect(parseGildanRow(makeRawRow({ 2: null }))).toBeNull()
    expect(parseGildanRow(makeRawRow({ 19: "" }))).toBeNull()
  })

  it("coerces empty strings to null", () => {
    const r = parseGildanRow(makeRawRow({ 9: "  ", 11: "" }))
    expect(r!.fit).toBeNull()
    expect(r!.fabricWeight).toBeNull()
  })

  it("drops invalid numbers", () => {
    const r = parseGildanRow(makeRawRow({ 34: "n/a", 31: "" }))
    expect(r!.classicCost).toBeNull()
    expect(r!.rrpInc).toBeNull()
  })

  it("collapses null/empty view filenames out of the viewSrcFilenames array", () => {
    const r = parseGildanRow(makeRawRow({ 25: null, 27: "" }))
    expect(r!.viewSrcFilenames).toEqual([
      "102_Blush_01.jpg",
      "102_Blush_02.jpg",
      "102_Blush_04.jpg",
    ])
  })
})

describe("isActiveStatus", () => {
  it("accepts Active in any case", () => {
    expect(isActiveStatus("Active")).toBe(true)
    expect(isActiveStatus("ACTIVE")).toBe(true)
    expect(isActiveStatus("active")).toBe(true)
    expect(isActiveStatus("  Active  ")).toBe(true)
  })
  it("rejects NEW - INACTIVE and empty", () => {
    expect(isActiveStatus("NEW - INACTIVE")).toBe(false)
    expect(isActiveStatus("")).toBe(false)
    expect(isActiveStatus("Inactive")).toBe(false)
  })
})

describe("handleForGildanProduct", () => {
  it("uses the canonical Gildan brand handle map", () => {
    expect(handleForGildanProduct("American Apparel", "102")).toBe(
      "american-apparel-102"
    )
    expect(handleForGildanProduct("Gildan", "64000")).toBe("gildan-64000")
    expect(handleForGildanProduct("Comfort Colors", "1717")).toBe(
      "comfort-colors-1717"
    )
  })
  it("slugifies unknown brand names rather than crashing", () => {
    expect(handleForGildanProduct("Some New Brand", "X1")).toBe(
      "some-new-brand-x1"
    )
  })
})

describe("groupRowsByStyle", () => {
  function row(partial: Partial<GildanRow> = {}): GildanRow {
    return {
      vendorSkuChild: partial.vendorSkuChild ?? "SKU",
      brand: partial.brand ?? "American Apparel",
      styleParent: partial.styleParent ?? "102",
      productNameSystem: partial.productNameSystem ?? "",
      descriptionOfItem:
        partial.descriptionOfItem ?? "Women's Fine Jersey Boxy T-Shirt",
      size: partial.size ?? "MEDIUM",
      sizeCode: partial.sizeCode ?? "M",
      gender: partial.gender ?? "Womens",
      fit: partial.fit ?? "Boxy Fit",
      fabricContent: partial.fabricContent ?? "100% Ring Spun Cotton",
      fabricWeight: partial.fabricWeight ?? "146g/m²",
      productFeatures: partial.productFeatures ?? "soft, breathable",
      dnProductType: partial.dnProductType ?? "Apparel",
      topTierCategory: partial.topTierCategory ?? "Ladies",
      subcategory1: partial.subcategory1 ?? "T-Shirt",
      subcategory2: partial.subcategory2 ?? "Crew Neck",
      colourName: partial.colourName ?? "Blush",
      hex: partial.hex ?? "#CCA1A6",
      heroImageFilename: partial.heroImageFilename ?? "102_Blush_01.jpg",
      viewSrcFilenames: partial.viewSrcFilenames ?? ["102_Blush_02.jpg"],
      rrpInc: partial.rrpInc ?? 29.95,
      heavyweightCost: partial.heavyweightCost ?? 7.25,
      midweightCost: partial.midweightCost ?? 7.75,
      classicCost: partial.classicCost ?? 8.25,
      productUrl:
        partial.productUrl ?? "https://gildanbrands.com.au/american-apparel-102/",
      status: partial.status ?? "Active",
      weightPounds: partial.weightPounds ?? 0.22,
      countryOfOrigin: partial.countryOfOrigin ?? "GT",
    }
  }

  it("groups by (brand, styleParent) and aggregates colours + sizes", () => {
    const rows: GildanRow[] = [
      row({ colourName: "Blush", sizeCode: "S", vendorSkuChild: "SKU-BLUSH-S" }),
      row({ colourName: "Blush", sizeCode: "M", vendorSkuChild: "SKU-BLUSH-M" }),
      row({
        colourName: "Black",
        sizeCode: "S",
        vendorSkuChild: "SKU-BLACK-S",
        hex: "#000000",
        heroImageFilename: "102_Black_01.jpg",
        viewSrcFilenames: ["102_Black_02.jpg"],
      }),
      row({
        colourName: "Black",
        sizeCode: "L",
        vendorSkuChild: "SKU-BLACK-L",
        heroImageFilename: "102_Black_01.jpg",
        viewSrcFilenames: ["102_Black_02.jpg"],
      }),
    ]
    const products = groupRowsByStyle(rows)
    expect(products.length).toBe(1)
    const p = products[0]
    expect(p.brand).toBe("American Apparel")
    expect(p.styleParent).toBe("102")
    expect(p.colours.length).toBe(2)
    // Colours alphabetical.
    expect(p.colours.map((c) => c.name)).toEqual(["Black", "Blush"])
    const black = p.colours.find((c) => c.name === "Black")!
    expect(black.sizes.map((s) => s.sizeCode)).toEqual(["S", "L"])
    expect(black.hex).toBe("#000000")
    expect(black.images.hero).toBe("102_Black_01.jpg")
    expect(black.images.views).toEqual(["102_Black_02.jpg"])
  })

  it("skips inactive status rows entirely", () => {
    const rows: GildanRow[] = [
      row({ status: "Active" }),
      row({ status: "NEW - INACTIVE", colourName: "Cream" }),
    ]
    const products = groupRowsByStyle(rows)
    expect(products.length).toBe(1)
    expect(products[0].colours.map((c) => c.name)).toEqual(["Blush"])
  })

  it("picks the LOWEST per-style classic cost across mixed-size rows", () => {
    const rows: GildanRow[] = [
      row({ sizeCode: "M", classicCost: 8.25 }),
      row({ sizeCode: "4XL", classicCost: 9.5, vendorSkuChild: "X" }),
      row({ sizeCode: "S", classicCost: 8.0, vendorSkuChild: "Y" }),
    ]
    const products = groupRowsByStyle(rows)
    expect(products[0].classicCost).toBe(8.0)
  })

  it("converts weight pounds to grams averaged across rows", () => {
    const rows: GildanRow[] = [
      row({ sizeCode: "S", weightPounds: 0.2, vendorSkuChild: "A" }),
      row({ sizeCode: "L", weightPounds: 0.3, vendorSkuChild: "B" }),
    ]
    const p = groupRowsByStyle(rows)[0]
    // (0.2 + 0.3) / 2 * 453.59 ≈ 113.4g
    expect(p.weightGrams).toBeGreaterThan(110)
    expect(p.weightGrams).toBeLessThan(120)
  })

  it("logs drift warnings when classification fields disagree across a group", () => {
    const rows: GildanRow[] = [
      row({ sizeCode: "S", subcategory2: "Crew Neck" }),
      row({ sizeCode: "M", subcategory2: "V-Neck", vendorSkuChild: "X" }),
    ]
    const warnings: string[] = []
    groupRowsByStyle(rows, warnings)
    expect(warnings.some((w) => w.includes("subcategory2"))).toBe(true)
  })

  it("sorts sizes within a colour by canonical ladder", () => {
    const rows: GildanRow[] = [
      row({ sizeCode: "L", vendorSkuChild: "L" }),
      row({ sizeCode: "S", vendorSkuChild: "S" }),
      row({ sizeCode: "2XL", vendorSkuChild: "2XL" }),
      row({ sizeCode: "M", vendorSkuChild: "M" }),
    ]
    const p = groupRowsByStyle(rows)[0]
    expect(p.colours[0].sizes.map((s) => s.sizeCode)).toEqual([
      "S",
      "M",
      "L",
      "2XL",
    ])
  })

  it("title-cases the descriptionOfItem", () => {
    const rows: GildanRow[] = [
      row({
        descriptionOfItem: "AMERICAN APPAREL WOMEN'S FINE JERSEY BOXY T-SHIRT",
      }),
    ]
    const p = groupRowsByStyle(rows)[0]
    expect(p.title).toBe("American Apparel Women's Fine Jersey Boxy T-shirt")
  })
})

describe("cleanTitle + compareSizeCodes", () => {
  it("trims and title-cases", () => {
    expect(cleanTitle("  hello   WORLD  ")).toBe("Hello World")
    expect(cleanTitle("")).toBe("")
  })
  it("compareSizeCodes orders the canonical ladder", () => {
    const codes = ["XL", "S", "2XL", "M", "L", "XS", "3XL"]
    codes.sort(compareSizeCodes)
    expect(codes).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"])
  })
  it("compareSizeCodes pushes non-ladder sizes to the end", () => {
    const codes = ["M", "ONS", "S", "One Size"]
    codes.sort(compareSizeCodes)
    expect(codes.slice(0, 2)).toEqual(["S", "M"])
  })
})

describe("renderGildanDescription", () => {
  function product(overrides: Partial<GildanProduct> = {}): GildanProduct {
    return {
      brand: "American Apparel",
      styleParent: "102",
      title: "American Apparel Women's Fine Jersey Boxy T-Shirt",
      gender: "Womens",
      fit: "Boxy Fit",
      fabricContent: "100% Ring Spun Cotton",
      fabricWeight: "146g/m²",
      productFeatures: "soft, breathable, non-topstitched",
      dnProductType: "Apparel",
      topTierCategory: "Ladies",
      subcategory1: "T-Shirt",
      subcategory2: "Crew Neck",
      productUrl: null,
      countryOfOrigin: "GT",
      classicCost: 8.25,
      rrpInc: 29.95,
      weightGrams: 100,
      colours: [],
      status: "Active",
      ...overrides,
    }
  }
  it("emits sections only for non-null inputs", () => {
    const desc = renderGildanDescription(product())
    expect(desc).toContain("Fabric: 100% Ring Spun Cotton")
    expect(desc).toContain("Weight: 146g/m²")
    expect(desc).toContain("Fit: Boxy Fit")
    expect(desc).toContain("- soft")
    expect(desc).toContain("- breathable")
  })
  it("returns empty when no fields are set", () => {
    const desc = renderGildanDescription(
      product({
        fabricContent: null,
        fabricWeight: null,
        fit: null,
        productFeatures: null,
      })
    )
    expect(desc).toBe("")
  })
})

describe("buildGildanGarmentImages", () => {
  it("maps filenames through the urlByFilename map, identifying front/back/model", () => {
    const colour: GildanColour = {
      name: "Blush",
      hex: "#CCA1A6",
      images: {
        hero: "102_Blush_01.jpg",
        views: [
          "102_Blush_02.jpg",
          "102_Blush_03.jpg",
          "102_Blush_04.jpg",
        ],
      },
      sizes: [],
    }
    const urlByFilename = new Map([
      [
        "102_Blush_01.jpg",
        "https://cdn11.bigcommerce.com/.../102_Blush_01__1234.5678.jpg",
      ],
      [
        "102_Blush_02.jpg",
        "https://cdn11.bigcommerce.com/.../102_Blush_02__1234.5678.jpg",
      ],
      [
        "102_Blush_03.jpg",
        "https://cdn11.bigcommerce.com/.../102_Blush_03__1234.5678.jpg",
      ],
    ])
    const result = buildGildanGarmentImages(colour, urlByFilename)
    expect(result.front).toContain("_01__")
    expect(result.back).toContain("_02__")
    expect(result.model_image).toContain("_03__")
    expect(result.all.length).toBe(3) // 04 not in map → not included
  })
  it("returns empty front string if no filenames resolve", () => {
    const colour: GildanColour = {
      name: "Blush",
      hex: null,
      images: { hero: "102_Blush_01.jpg", views: [] },
      sizes: [],
    }
    const result = buildGildanGarmentImages(colour, new Map())
    expect(result.front).toBe("")
    expect(result.back).toBeUndefined()
    expect(result.all).toEqual([])
  })
})

describe("extractImageUrlsFromGildanHtml", () => {
  it("parses CDN URLs and maps them to xlsx filenames, normalising to 1280w", () => {
    const html = `
      <img src="https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1889/6041/102_Blush_01__72716.1764901939.jpg?c=1">
      <img src="https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1920w/products/1889/6042/102_Blush_02__22074.1764901945.jpg?c=1">
      <img src="https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/2560w/products/1889/6033/102_Burgundy_04__88692.1764901944.jpg">
    `
    const out = extractImageUrlsFromGildanHtml(html)
    expect(out.get("102_Blush_01.jpg")).toBe(
      "https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1889/6041/102_Blush_01__72716.1764901939.jpg"
    )
    // 1920w in source HTML — normalised to 1280w in output.
    expect(out.get("102_Blush_02.jpg")).toBe(
      "https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1889/6042/102_Blush_02__22074.1764901945.jpg"
    )
    // 2560w in source HTML — normalised to 1280w in output.
    expect(out.get("102_Burgundy_04.jpg")).toBe(
      "https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1889/6033/102_Burgundy_04__88692.1764901944.jpg"
    )
  })
  it("returns an empty map on empty html", () => {
    expect(extractImageUrlsFromGildanHtml("").size).toBe(0)
  })

  it("matches the multi-suffix CDN filename form on newer product pages", () => {
    // Observed on gildan-hammer-h000-t-shirt and other 2025/2026 uploads —
    // filenames have TWO __<digits>.<digits> suffix groups instead of one.
    const html = `<img src="https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1867/1591/H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg?c=1">`
    const out = extractImageUrlsFromGildanHtml(html)
    // The xlsx ships filenames like "H000_White_04.jpg" — the alias maps
    // _A<n> → _<padded n> so the lookup still resolves.
    expect(out.get("H000_White_04.jpg")).toBe(
      "https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1867/1591/H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg"
    )
    // The raw _A<n> form is also stored for any future xlsx that uses it.
    expect(out.get("H000_White_A4.jpg")).toBe(
      "https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1867/1591/H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg"
    )
  })

  it("matches the 1280x1280 size form as well as 1280w", () => {
    const html = `<img src="https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280x1280/products/1867/1591/H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg">`
    const out = extractImageUrlsFromGildanHtml(html)
    // Output URL is rewritten to the 1280w bucket regardless of which
    // source srcset variant we matched.
    expect(out.get("H000_White_04.jpg")).toBe(
      "https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1867/1591/H000_White_A4__60614.1736478537.386.513__46175.1746035808.jpg"
    )
  })

  it("does NOT alias non-A-prefixed stems", () => {
    // SF500_Black_01 stays as-is — no _A<n> → _<n> rewrite to corrupt
    // the lookup.
    const html = `<img src="https://cdn11.bigcommerce.com/s-zjdadllt1z/images/stencil/1280w/products/1895/7194/SF500_Black_01__79162.1766117298.jpg">`
    const out = extractImageUrlsFromGildanHtml(html)
    expect(out.get("SF500_Black_01.jpg")).toBeDefined()
    // No spurious alias under SF500_Black_00.jpg etc.
    expect(out.get("SF500_Black_00.jpg")).toBeUndefined()
  })
})

describe("parseGildanSitemap", () => {
  const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://gildanbrands.com.au/gildan-softstyle-sf500-hoodie/</loc></url>
  <url><loc>https://gildanbrands.com.au/gildan-hammer-h000-t-shirt/</loc></url>
  <url><loc>https://gildanbrands.com.au/american-apparel-102-t-shirt/</loc></url>
  <url><loc>https://gildanbrands.com.au/comfort-colors-1717/</loc></url>
  <url><loc>https://gildanbrands.com.au/gildan-dryblend-8800b-polo-shirt/</loc></url>
  <url><loc>https://gildanbrands.com.au/gildan-softstyle-64v00-t-shirt/</loc></url>
  <url><loc>https://gildanbrands.com.au/gildan-heavy-cotton-5400-t-shirt/</loc></url>
</urlset>`

  it("extracts style codes from URL slugs (alphanumeric tokens containing a digit)", () => {
    const m = parseGildanSitemap(fixture)
    expect(m.get("sf500")).toBe(
      "https://gildanbrands.com.au/gildan-softstyle-sf500-hoodie/"
    )
    expect(m.get("h000")).toBe(
      "https://gildanbrands.com.au/gildan-hammer-h000-t-shirt/"
    )
    expect(m.get("102")).toBe(
      "https://gildanbrands.com.au/american-apparel-102-t-shirt/"
    )
    expect(m.get("1717")).toBe(
      "https://gildanbrands.com.au/comfort-colors-1717/"
    )
    expect(m.get("8800b")).toBe(
      "https://gildanbrands.com.au/gildan-dryblend-8800b-polo-shirt/"
    )
    expect(m.get("64v00")).toBe(
      "https://gildanbrands.com.au/gildan-softstyle-64v00-t-shirt/"
    )
    expect(m.get("5400")).toBe(
      "https://gildanbrands.com.au/gildan-heavy-cotton-5400-t-shirt/"
    )
  })

  it("returns an empty map on empty/malformed input", () => {
    expect(parseGildanSitemap("").size).toBe(0)
    expect(parseGildanSitemap("<root></root>").size).toBe(0)
  })

  it("filters out tokens without a digit", () => {
    const m = parseGildanSitemap(fixture)
    // Pure-word tokens shouldn't end up as style codes.
    expect(m.get("gildan")).toBeUndefined()
    expect(m.get("softstyle")).toBeUndefined()
    expect(m.get("hoodie")).toBeUndefined()
    expect(m.get("t")).toBeUndefined()
    expect(m.get("shirt")).toBeUndefined()
  })

  it("first occurrence wins on collisions", () => {
    const dupes = `
      <url><loc>https://example.com/a-1000-shirt/</loc></url>
      <url><loc>https://example.com/b-1000-hoodie/</loc></url>
    `
    const m = parseGildanSitemap(dupes)
    expect(m.get("1000")).toBe("https://example.com/a-1000-shirt/")
  })
})

describe("GildanSitemapResolver", () => {
  it("caches the parsed map across multiple resolve() calls", async () => {
    let fetchCount = 0
    const fixture = `<urlset>
      <url><loc>https://gildanbrands.com.au/gildan-softstyle-sf500-hoodie/</loc></url>
    </urlset>`
    const resolver = new GildanSitemapResolver({
      fetcher: async () => {
        fetchCount++
        return {
          ok: true,
          status: 200,
          text: async () => fixture,
        }
      },
    })
    expect(await resolver.resolve("SF500")).toBe(
      "https://gildanbrands.com.au/gildan-softstyle-sf500-hoodie/"
    )
    expect(await resolver.resolve("sf500")).toBe(
      "https://gildanbrands.com.au/gildan-softstyle-sf500-hoodie/"
    )
    expect(await resolver.resolve("not-in-sitemap")).toBeNull()
    expect(fetchCount).toBe(1)
  })

  it("returns null + logs a warning when the sitemap fetch fails", async () => {
    const warnings: string[] = []
    const resolver = new GildanSitemapResolver({
      logger: { warn: (m) => warnings.push(m) },
      fetcher: async () => ({
        ok: false,
        status: 500,
        text: async () => "",
      }),
    })
    expect(await resolver.resolve("SF500")).toBeNull()
    expect(warnings.some((w) => w.includes("HTTP 500"))).toBe(true)
  })

  it("survives a thrown fetcher (network error) without crashing", async () => {
    const resolver = new GildanSitemapResolver({
      fetcher: async () => {
        throw new Error("ECONNREFUSED")
      },
    })
    expect(await resolver.resolve("SF500")).toBeNull()
    expect(await resolver.size()).toBe(0)
  })
})

describe("priceLadderFromGildan + resolveGildanCost", () => {
  it("returns null for null/zero/NaN cost", () => {
    expect(resolveGildanCost(null)).toBeNull()
    expect(resolveGildanCost(0)).toBeNull()
    expect(resolveGildanCost(NaN)).toBeNull()
    expect(priceLadderFromGildan(null)).toBeNull()
  })
  it("applies cost adjustment", () => {
    expect(resolveGildanCost(10, 1.15)).toBeCloseTo(11.5)
  })
  it("clamps non-positive adjustments to 1.0", () => {
    expect(resolveGildanCost(10, 0)).toBeCloseTo(10)
    expect(resolveGildanCost(10, -2)).toBeCloseTo(10)
    expect(resolveGildanCost(10, NaN)).toBeCloseTo(10)
  })
  it("produces a 5-tier ladder for a real-world Classic cost", () => {
    // SC Prints' Classic-tier price for AA 102 = 8.25.
    const ladder = priceLadderFromGildan(8.25)
    expect(ladder).not.toBeNull()
    expect(ladder!.base).toBeGreaterThan(0)
    expect(ladder!.tier100Plus).toBeGreaterThan(0)
    expect(ladder!.tier10to19).toBeGreaterThan(ladder!.tier20to49)
    expect(ladder!.tier20to49).toBeGreaterThan(ladder!.tier50to99)
    expect(ladder!.tier50to99).toBeGreaterThan(ladder!.tier100Plus)
  })
})
