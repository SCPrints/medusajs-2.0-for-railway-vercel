import { PRODUCT_IMPORT_CSV_HEADERS } from "../product-import-template-csv"
import { parseCsv } from "../csv-import"
import {
  buildBatchCreatesFromParsedCsv,
  computeSpreadsheetPreview,
  detectFashionBizVariantCatalog,
  detectGoldCatalogFormat,
  expandFashionBizCatalogToTemplate,
  expandGoldCatalogToTemplate,
  normalizeSpreadsheetForImport,
} from "../spreadsheet-sync-import"

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
    lines.push(
      PRODUCT_IMPORT_CSV_HEADERS.map((h) => row[h.toLowerCase()] ?? "").join(",")
    )
  }
  return lines.join("\n")
}

describe("spreadsheet-sync-import", () => {
  it("computeSpreadsheetPreview counts products and tier rules", () => {
    const r = emptyRow()
    r["product handle"] = "acme-shirt"
    r["product title"] = "Acme Shirt"
    r["product status"] = "published"
    r["shipping profile id"] = "sp_test"
    r["variant sku"] = "ACM-SHIRT-BLU-M"
    r["variant title"] = "Blue / M"
    r["variant option 1 name"] = "Color"
    r["variant option 1 value"] = "Blue"
    r["base_sale_price"] = "90"
    r["tier_10_to_49_price"] = "85"
    r["tier_50_to_99_price"] = "80"
    r["tier_100_plus_price"] = "75"

    const parsed = parseCsv(buildCsv([r]))
    const preview = computeSpreadsheetPreview(parsed)

    expect(preview.productCount).toBe(1)
    expect(preview.variantCount).toBe(1)
    expect(preview.tierRuleCount).toBe(1)
    expect(preview.validationErrors.length).toBe(0)
  })

  it("buildBatchCreatesFromParsedCsv builds one product with tier map", () => {
    const r = emptyRow()
    r["product handle"] = "acme-shirt"
    r["product title"] = "Acme Shirt"
    r["product status"] = "published"
    r["shipping profile id"] = "sp_test"
    r["variant sku"] = "ACM-SHIRT-BLU-M"
    r["variant title"] = "Blue / M"
    r["variant option 1 name"] = "Color"
    r["variant option 1 value"] = "Blue"
    r["base_sale_price"] = "100"
    r["tier_10_to_49_price"] = "95"
    r["tier_50_to_99_price"] = "90"
    r["tier_100_plus_price"] = "85"

    const parsed = parseCsv(buildCsv([r]))
    const { creates, tierBySku, errors } = buildBatchCreatesFromParsedCsv(parsed)

    expect(errors.length).toBe(0)
    expect(creates.length).toBe(1)
    expect(creates[0]?.handle).toBe("acme-shirt")
    expect(creates[0]?.shipping_profile_id).toBe("sp_test")
    expect(creates[0]?.variants?.length).toBe(1)

    expect(tierBySku.has("ACM-SHIRT-BLU-M")).toBe(true)
    expect(tierBySku.get("ACM-SHIRT-BLU-M")).toEqual({
      base: 10000,
      t10: 9500,
      t50: 9000,
      t100: 8500,
    })
  })

  it("reports missing required columns", () => {
    const parsed = parseCsv("foo,bar\n1,2")
    const preview = computeSpreadsheetPreview(parsed)
    expect(preview.validationErrors.some((e) => e.includes("product handle"))).toBe(true)
  })

  const GOLD_HEADER =
    "customerGroupId,STYLECODE,PRODUCT_NAME,COMPOSITION,FABRIC,SIZE_RANGE,COLOURS_COUNT,SHORT_DESCRIPTION,BOX_QTY,PRICE,CATEGORY,CATEGORY_SORT,Product URL"

  it("detects AS Colour wholesale CSV shape", () => {
    const raw =
      `${GOLD_HEADER}\n3,1000,Parcel Tote,,,,,,50,6.95,BAGS,41000,https://example.com/p`
    const parsed = parseCsv(raw)
    expect(detectGoldCatalogFormat(parsed)).toBe(true)
  })

  it("expandGoldCatalogToTemplate maps STYLECODE rows", () => {
    const raw = `${GOLD_HEADER}\n3,1000,Parcel Tote,,,,,,50,6.95,BAGS,41000,`
    const parsed = parseCsv(raw)
    const exp = expandGoldCatalogToTemplate(parsed, "sp_test")
    expect(exp.rows.length).toBe(1)
    expect(exp.rows[0]?.["product handle"]).toBe("ascolour-1000")
    expect(exp.rows[0]?.["shipping profile id"]).toBe("sp_test")
    expect(computeSpreadsheetPreview(exp).validationErrors.length).toBe(0)
  })

  it("normalizeSpreadsheetForImport requires shipping profile for gold CSV", () => {
    const parsed = parseCsv(`${GOLD_HEADER}\n3,1000,T,,,,,,1,1,,,`)
    expect(normalizeSpreadsheetForImport(parsed, {}).readyParsed).toBeNull()
    expect(
      normalizeSpreadsheetForImport(parsed, { defaultShippingProfileId: "sp_z" }).readyParsed?.rows.length
    ).toBe(1)
  })

  const FASHIONBIZ_HEADER = "sku,style_code,size,colour,price,product_name"

  it("detects FashionBiz / biz-collection variant CSV shape", () => {
    const raw = `${FASHIONBIZ_HEADER}\nSKU1,P3225,M,Navy,19.99,Women Elite Polo`
    const parsed = parseCsv(raw)
    expect(detectFashionBizVariantCatalog(parsed)).toBe(true)
  })

  it("detects FashionBiz when product handle column exists but every cell is empty", () => {
    const raw =
      "product handle,sku,style_code,size,colour,price1\n,A,ZP145,M,Navy,29.95\n,B,ZP145,L,Navy,29.95"
    const parsed = parseCsv(raw)
    expect(detectFashionBizVariantCatalog(parsed)).toBe(true)
  })

  it("detects FashionBiz when sku column is named variant sku", () => {
    const raw = "variant sku,style_code,size,colour,price\nSKU1,P3225,M,Navy,10"
    const parsed = parseCsv(raw)
    expect(detectFashionBizVariantCatalog(parsed)).toBe(true)
  })

  it("detects variant grid for ERP-style Stock Item + Style Code headers", () => {
    const raw =
      "Stock Item,Style Code,Size,Colour,Unit Price\n9401042561558,ZP145R,M,Navy,29.95"
    expect(detectFashionBizVariantCatalog(parseCsv(raw))).toBe(true)
  })

  it("expandFashionBizCatalogToTemplate maps rows with Size + Colour options", () => {
    const raw = `${FASHIONBIZ_HEADER}\nA,P3225,M,Navy,19.99,W Polo\nB,P3225,L,Navy,19.99,W Polo`
    const parsed = parseCsv(raw)
    const exp = expandFashionBizCatalogToTemplate(parsed, "sp_fb")
    expect(exp.rows.length).toBe(2)
    expect(exp.rows[0]?.["product handle"]).toBe("biz-collection-p3225")
    expect(exp.rows[0]?.["variant option 1 name"]).toBe("Size")
    expect(exp.rows[0]?.["variant option 2 name"]).toBe("Colour")
    expect(computeSpreadsheetPreview(exp).validationErrors.length).toBe(0)

    const { creates, errors } = buildBatchCreatesFromParsedCsv(exp)
    expect(errors.length).toBe(0)
    expect(creates.length).toBe(1)
    const opts = creates[0]?.options as Array<{ title: string; values: string[] }>
    expect(opts?.length).toBe(2)
    expect(opts?.[0]?.title).toBe("Size")
    expect(opts?.[1]?.title).toBe("Colour")
    const vars = creates[0]?.variants as Array<{ options: Record<string, string> }>
    expect(vars?.length).toBe(2)
    expect(vars?.[0]?.options["Size"]).toBe("M")
    expect(vars?.[0]?.options["Colour"]).toBe("Navy")
  })

  it("normalizeSpreadsheetForImport requires shipping profile for FashionBiz CSV", () => {
    const parsed = parseCsv(`${FASHIONBIZ_HEADER}\nA,P3225,M,Navy,10,Polo`)
    expect(normalizeSpreadsheetForImport(parsed, {}).readyParsed).toBeNull()
    expect(
      normalizeSpreadsheetForImport(parsed, { defaultShippingProfileId: "sp_x" }).readyParsed?.rows.length
    ).toBe(1)
  })
})
