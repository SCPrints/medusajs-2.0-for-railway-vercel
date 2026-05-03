import { PRODUCT_IMPORT_CSV_HEADERS } from "../product-import-template-csv"
import { parseCsv } from "../csv-import"
import {
  buildBatchUpdatesFromParsedCsv,
  computeProductUpdateColumnCandidates,
  computeProductUpdatePreview,
  PRODUCT_GALLERY_IMAGES_CSV_KEY,
  spreadsheetHeadersIgnoringPatchable,
  validateProductUpdateHeaders,
} from "../spreadsheet-sync-update-import"

const emptyRow = (): Record<string, string> => {
  const r: Record<string, string> = {}
  for (const h of PRODUCT_IMPORT_CSV_HEADERS) {
    r[h.toLowerCase()] = ""
  }
  return r
}

const buildCsv = (rows: Record<string, string>[]): string => {
  const lines = [PRODUCT_IMPORT_CSV_HEADERS.join(",")]
  for (const row of rows) {
    lines.push(PRODUCT_IMPORT_CSV_HEADERS.map((h) => row[h.toLowerCase()] ?? "").join(","))
  }
  return lines.join("\n")
}

describe("spreadsheet-sync-update-import", () => {
  it("validateProductUpdateHeaders requires product id column", () => {
    const parsed = parseCsv("Product Handle,Variant SKU\nfoo,bar")
    expect(validateProductUpdateHeaders(parsed)).toContain("product id")
  })

  it("computeProductUpdatePreview errors when product id missing on a row", () => {
    const r = emptyRow()
    r["product title"] = "T"
    r["variant sku"] = "SKU"
    const parsed = parseCsv(buildCsv([r]))
    const p = computeProductUpdatePreview(parsed)
    expect(p.validationErrors.some((e) => e.includes("Product Id"))).toBe(true)
  })

  it("buildBatchUpdatesFromParsedCsv builds patch from first row per product id", () => {
    const r1 = emptyRow()
    r1["product id"] = "prod_test_1"
    r1["product title"] = "Updated Title"
    r1["product collection id"] = "pcol_x"
    r1["product type id"] = "ptyp_y"
    r1["product tag 1 id"] = "ptag_z"
    r1["variant sku"] = "SKU-A"

    const r2 = emptyRow()
    r2["product id"] = "prod_test_1"
    r2["product title"] = "Ignored second row title"
    r2["variant sku"] = "SKU-B"

    const parsed = parseCsv(buildCsv([r1, r2]))
    const { updates, errors } = buildBatchUpdatesFromParsedCsv(parsed)

    expect(errors.length).toBe(0)
    expect(updates.length).toBe(1)
    expect(updates[0]).toMatchObject({
      id: "prod_test_1",
      title: "Updated Title",
      collection_id: "pcol_x",
      type_id: "ptyp_y",
      tags: [{ id: "ptag_z" }],
    })
  })

  it("buildBatchUpdatesFromParsedCsv errors when product has only id", () => {
    const r = emptyRow()
    r["product id"] = "prod_only_id"
    r["variant sku"] = "SKU"
    const parsed = parseCsv(buildCsv([r]))
    const { updates, errors } = buildBatchUpdatesFromParsedCsv(parsed)
    expect(updates.length).toBe(0)
    expect(errors.some((e) => e.includes("no non-empty"))).toBe(true)
  })

  it("buildBatchUpdatesFromParsedCsv only applies selected columns", () => {
    const r = emptyRow()
    r["product id"] = "prod_a"
    r["product title"] = "Keep Title"
    r["product subtitle"] = "Sub A"
    r["product collection id"] = "pcol_x"
    r["variant sku"] = "SKU1"
    const parsed = parseCsv(buildCsv([r]))
    const sel = new Set<string>(["product title"])
    const { updates, errors } = buildBatchUpdatesFromParsedCsv(parsed, { enabledCsvKeys: sel })
    expect(errors.length).toBe(0)
    expect(updates.length).toBe(1)
    expect(updates[0]).toEqual({ id: "prod_a", title: "Keep Title" })
  })

  it("buildBatchUpdatesFromParsedCsv rejects empty column selection", () => {
    const r = emptyRow()
    r["product id"] = "prod_a"
    r["product title"] = "T"
    r["variant sku"] = "S"
    const parsed = parseCsv(buildCsv([r]))
    const { updates, errors } = buildBatchUpdatesFromParsedCsv(parsed, { enabledCsvKeys: new Set() })
    expect(updates.length).toBe(0)
    expect(errors.some((e) => e.includes("Select at least one"))).toBe(true)
  })

  it("computeProductUpdateColumnCandidates counts first row per Product Id only", () => {
    const r1 = emptyRow()
    r1["product id"] = "prod_1"
    r1["product title"] = "T1"
    r1["variant sku"] = "A"

    const r2 = emptyRow()
    r2["product id"] = "prod_2"
    r2["product title"] = "T2"
    r2["product subtitle"] = "Second row subtitle only"
    r2["variant sku"] = "B"

    const parsed = parseCsv(buildCsv([r1, r2]))
    const cand = computeProductUpdateColumnCandidates(parsed)
    const title = cand.find((c) => c.csvKey === "product title")
    const sub = cand.find((c) => c.csvKey === "product subtitle")
    expect(title?.affectedProductCount).toBe(2)
    expect(sub?.affectedProductCount).toBe(1)
  })

  describe("product gallery images (virtual patch column)", () => {
    it("emits a 2-image array when both Image Urls are filled and the column is enabled", () => {
      const r = emptyRow()
      r["product id"] = "prod_g1"
      r["product image 1 url"] = "https://cdn.example.com/a.jpg"
      r["product image 2 url"] = "https://cdn.example.com/b.jpg"
      r["variant sku"] = "SKU"
      const parsed = parseCsv(buildCsv([r]))
      const { updates, errors } = buildBatchUpdatesFromParsedCsv(parsed, {
        enabledCsvKeys: new Set([PRODUCT_GALLERY_IMAGES_CSV_KEY]),
      })
      expect(errors.length).toBe(0)
      expect(updates).toEqual([
        {
          id: "prod_g1",
          images: [
            { url: "https://cdn.example.com/a.jpg" },
            { url: "https://cdn.example.com/b.jpg" },
          ],
        },
      ])
    })

    it("emits a 1-image array when only one Image Url is filled", () => {
      const r = emptyRow()
      r["product id"] = "prod_g2"
      r["product image 1 url"] = "https://cdn.example.com/only.jpg"
      r["variant sku"] = "SKU"
      const parsed = parseCsv(buildCsv([r]))
      const { updates, errors } = buildBatchUpdatesFromParsedCsv(parsed, {
        enabledCsvKeys: new Set([PRODUCT_GALLERY_IMAGES_CSV_KEY]),
      })
      expect(errors.length).toBe(0)
      expect(updates[0]?.images).toEqual([{ url: "https://cdn.example.com/only.jpg" }])
    })

    it("does not emit an images key when both cells are empty (no accidental gallery wipe)", () => {
      const r = emptyRow()
      r["product id"] = "prod_g3"
      r["product title"] = "Has Title"
      r["variant sku"] = "SKU"
      const parsed = parseCsv(buildCsv([r]))
      const { updates } = buildBatchUpdatesFromParsedCsv(parsed, {
        enabledCsvKeys: new Set([PRODUCT_GALLERY_IMAGES_CSV_KEY, "product title"]),
      })
      expect(updates[0]).toEqual({ id: "prod_g3", title: "Has Title" })
      expect((updates[0] as Record<string, unknown>).images).toBeUndefined()
    })

    it("does not change images when the column is not enabled", () => {
      const r = emptyRow()
      r["product id"] = "prod_g4"
      r["product image 1 url"] = "https://cdn.example.com/a.jpg"
      r["product title"] = "T"
      r["variant sku"] = "SKU"
      const parsed = parseCsv(buildCsv([r]))
      const { updates } = buildBatchUpdatesFromParsedCsv(parsed, {
        enabledCsvKeys: new Set(["product title"]),
      })
      expect(updates[0]).toEqual({ id: "prod_g4", title: "T" })
    })

    it("computeProductUpdateColumnCandidates surfaces the gallery virtual column when source headers exist", () => {
      const r = emptyRow()
      r["product id"] = "prod_g5"
      r["product image 1 url"] = "https://cdn.example.com/a.jpg"
      r["variant sku"] = "SKU"
      const parsed = parseCsv(buildCsv([r]))
      const cand = computeProductUpdateColumnCandidates(parsed)
      const gallery = cand.find((c) => c.csvKey === PRODUCT_GALLERY_IMAGES_CSV_KEY)
      expect(gallery).toBeTruthy()
      expect(gallery?.affectedProductCount).toBe(1)
    })

    it("spreadsheetHeadersIgnoringPatchable consumes the two image source headers (not listed as ignored extras)", () => {
      const r = emptyRow()
      r["product id"] = "prod_g6"
      r["product image 1 url"] = "https://cdn.example.com/a.jpg"
      r["product image 2 url"] = "https://cdn.example.com/b.jpg"
      r["variant sku"] = "SKU"
      const parsed = parseCsv(buildCsv([r]))
      const extras = spreadsheetHeadersIgnoringPatchable(parsed)
      expect(extras).not.toContain("product image 1 url")
      expect(extras).not.toContain("product image 2 url")
    })
  })
})
