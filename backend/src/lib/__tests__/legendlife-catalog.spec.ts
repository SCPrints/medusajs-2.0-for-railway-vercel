import {
  colourLabel,
  costFromPricing,
  frontByColour,
  galleryFor,
  handleFor,
  parseStockLevel,
  stockBySkuFrom,
  titleFor,
  unitWeightGrams,
  type LegendLifeProduct,
} from "../legendlife-catalog"
import { applyTitleFallbacks, classifyLegendLifeProduct } from "../product-taxonomy"

const img = (n: string) => `https://www.legendlife.com.au/media/catalog/product/${n}.jpg`

const tee: LegendLifeProduct = {
  styleCode: "ST2000",
  name: "Men's Classic T",
  shortDescription: "Men's Classic T",
  description: "A classic style.",
  class: "STED",
  brands: ["Stedman Collection"],
  genders: ["Men's"],
  fabricTypes: ["Cotton"],
  categorisation: ["Apparel", "Stedman Collection", "Tees"],
  specifications: ["Ring-spun", "S-5XL"],
  cartonSpecifications: ["Dimensions:40cm w x 33cm h x 60cm l", "Mass:20kg", "Carton Quantity:96"],
  images: { baseImage: [img("model1")], altImages: [img("model2"), img("model1")] },
  url: null,
  skus: [
    { sku: "ST2000-BLO-S", colours: ["Black Opal"], sizes: ["S"], image: [img("ST2000-BLO-S")] },
    { sku: "ST2000-BLO-M", colours: ["Black Opal"], sizes: ["M"], image: [img("ST2000-BLO-M")] },
    { sku: "ST2000-BG-S", colours: ["Bottle Green"], sizes: ["S"], image: [img("ST2000-BG-S")] },
  ],
}

describe("legendlife-catalog", () => {
  it("reads capped and odd stock levels", () => {
    expect(parseStockLevel("500+")).toBe(500)
    expect(parseStockLevel("1000+")).toBe(1000)
    expect(parseStockLevel("12")).toBe(12)
    expect(parseStockLevel("Mid December")).toBe(0)
    expect(parseStockLevel(null)).toBe(0)
  })

  it("uses the per-SKU Total location only", () => {
    const m = stockBySkuFrom({
      stock: [
        { sku: "A", locations: [{ name: "BNE", stockLevel: "0" }, { name: "Storm Direct", stockLevel: "70" }, { name: "On Order", stockLevel: "900" }, { name: "Total", stockLevel: "70" }] },
        { sku: "B", locations: [{ name: "BNE", stockLevel: "3" }] },
      ],
    })
    expect(m.get("A")).toBe(70)
    expect(m.get("B")).toBe(0)
  })

  it("takes band-1 price as cost", () => {
    expect(costFromPricing({ qty1: 19, price1: 6.8, qty2: 249, price2: 6.45 })).toBe(6.8)
    expect(costFromPricing({ qty1: 19, price1: 0 })).toBeNull()
    expect(costFromPricing(undefined)).toBeNull()
  })

  it("derives per-unit weight from the carton", () => {
    expect(unitWeightGrams(tee.cartonSpecifications)).toBe(208)
    expect(unitWeightGrams(["Mass:12kg"])).toBeNull()
  })

  it("builds handles, titles and colour labels", () => {
    expect(handleFor(tee)).toBe("stedman-collection-mens-classic-t-st2000")
    expect(titleFor({ name: "PET CAP", styleCode: "3831" })).toBe("Pet Cap")
    expect(titleFor({ name: "Men's Crew Softshell", styleCode: "CXJ-3" })).toBe("Men's Crew Softshell")
    expect(colourLabel({ sku: "x", colours: ["Black,Granite"], sizes: [], image: [] })).toBe("Black/Granite")
  })

  it("keeps one front per colour, then the model shots, deduped", () => {
    expect([...frontByColour(tee).entries()]).toEqual([
      ["Black Opal", img("ST2000-BLO-S")],
      ["Bottle Green", img("ST2000-BG-S")],
    ])
    expect(galleryFor(tee)).toEqual([img("ST2000-BLO-S"), img("ST2000-BG-S"), img("model1"), img("model2")])
  })

  it("classifies by the most specific category", () => {
    const t = (categorisation: string[], genders: string[] = []) =>
      classifyLegendLifeProduct({ categorisation, genders })
    expect(t(["Apparel", "Tees"], ["Men's"])).toEqual({ productType: "T-Shirts", tags: ["Men"] })
    expect(t(["Jackets", "Softshells", "Vests"], ["Women's"])).toEqual({ productType: "Jackets", tags: ["Women"] })
    expect(t(["Polo Shirts"], ["Youth"]).tags).toEqual(["Kids"])
    expect(t(["Headwear", "Caps"]).productType).toBe("Headwear")
    expect(t(["Bags", "Backpacks"]).productType).toBe("Bags")
    expect(t(["NOT ALLOCATED"]).productType).toBeNull()
    // Stormtech files hoodies under Jackets; scarves under Headwear.
    expect(classifyLegendLifeProduct({ categorisation: ["Jackets", "Stormtech Jackets"], genders: [], name: "Men's Dockyard Performance Hoody" }).productType).toBe("Hoodies")
    expect(t(["Headwear", "Scarves"]).productType).toBe("Accessories")
    // NOT ALLOCATED hoodies fall back to the title
    expect(applyTitleFallbacks(t(["NOT ALLOCATED"], ["Men's"]), "Men's Dockyard Performance Hoody").productType).not.toBeNull()
  })
})
