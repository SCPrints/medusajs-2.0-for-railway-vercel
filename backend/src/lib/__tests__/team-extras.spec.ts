import { cleanNamesNumbers, namesNumbersLabel, namesNumbersUnitMajor } from "../names-numbers"
import { poDocumentFileName, poDocumentFromMetadata } from "../po-document"
import { teamOrderFromMetadata } from "../roster"
import { colourFrontImage, isSizingKitLine, sizingKitProblem, sizingKitReturnBy } from "../sizing-kit"
import { stripServerTrustMetadata } from "../client-line-metadata"

describe("names and numbers", () => {
  it("cleans the choice; oversize and junk are dropped", () => {
    expect(cleanNamesNumbers({ names: "up_to_a4", numbers: "oversize" })).toEqual({ names: "up_to_a4", numbers: null })
    expect(cleanNamesNumbers({ names: null, numbers: null })).toBeNull()
    expect(cleanNamesNumbers("x")).toBeNull()
  })

  it("prices each as a print of that size at the order's quantity band", () => {
    // 10 garments = band 1: A4 10.5 + A6 7.5
    expect(namesNumbersUnitMajor({ names: "up_to_a4", numbers: "up_to_a6" }, 10)).toBe(18)
    // 100 garments = band 4: A6 5.5
    expect(namesNumbersUnitMajor({ names: "up_to_a6", numbers: null }, 100)).toBe(5.5)
  })

  it("labels and rides on the order", () => {
    expect(namesNumbersLabel({ names: "up_to_a4", numbers: "up_to_a6" })).toBe("Names (up to A4) + numbers (up to A6)")
    expect(teamOrderFromMetadata({ names_numbers: { names: "up_to_a3" } }).names_numbers).toEqual({ names: "up_to_a3", numbers: null })
  })
})

describe("sizing kit", () => {
  it("allows 1-12 sizes of one product", () => {
    const v = (id: string, p = "prod_1") => ({ id, product_id: p })
    expect(sizingKitProblem([v("a"), v("b")], ["a", "b"])).toBeNull()
    expect(sizingKitProblem([v("a"), v("b", "prod_2")], ["a", "b"])).toMatch(/one garment/)
    expect(sizingKitProblem([v("a")], ["a", "gone"])).toMatch(/isn't available/)
    expect(sizingKitProblem([], [])).toMatch(/at least one/)
  })

  it("returns in 14 days and is server-set only", () => {
    expect(sizingKitReturnBy("2026-11-24T00:00:00Z").toISOString().slice(0, 10)).toBe("2026-12-08")
    expect(isSizingKitLine({ sizing_kit: true })).toBe(true)
    expect(stripServerTrustMetadata({ sizing_kit: true, names_numbers: {}, product_handle: "x" })).toEqual({ product_handle: "x" })
  })
})

describe("sizing kit thumbnail", () => {
  const urls = [
    "https://cdn/x/5001_STAPLE_TEE_MAIN__1.jpg?c=1",
    "https://cdn/x/5001_STAPLE_TEE_BLACK_BACK__2.jpg?c=1",
    "https://cdn/x/5001_STAPLE_TEE_BLACK__3.jpg?c=1",
    "https://cdn/x/5001_STAPLE_TEE_DARK_GREY__4.jpg",
    "https://r2/jbs-wear/1HT_NAVY_front.jpg",
    "https://r2/jbs-wear/1HT_NAVY_back.jpg",
  ]
  it("picks the colour's front photo, never the back", () => {
    expect(colourFrontImage(urls, "BLACK")).toBe("https://cdn/x/5001_STAPLE_TEE_BLACK__3.jpg?c=1")
    expect(colourFrontImage(urls, "Dark Grey")).toBe("https://cdn/x/5001_STAPLE_TEE_DARK_GREY__4.jpg")
    expect(colourFrontImage(urls, "Navy")).toBe("https://r2/jbs-wear/1HT_NAVY_front.jpg")
    expect(colourFrontImage(urls, "Pink")).toBeNull()
  })
})

describe("PO document", () => {
  it("takes PDF / images only, with a safe name", () => {
    expect(poDocumentFileName("../../PO 123.pdf")).toBe("PO_123.pdf")
    expect(poDocumentFileName("po.exe")).toBeNull()
    expect(poDocumentFromMetadata({ po_document: { url: "https://x/po.pdf", name: "po.pdf" } })).toEqual({ url: "https://x/po.pdf", name: "po.pdf" })
    expect(poDocumentFromMetadata({ po_document: { url: "javascript:alert(1)", name: "x" } })).toBeNull()
  })
})
