import { PRODUCT_IMPORT_CSV_HEADERS } from "../product-import-template-csv"
import { parseCsv } from "../csv-import"
import {
  applyDefaultCollectionIdToParsedCsv,
  buildBatchCreatesFromParsedCsv,
  computeSpreadsheetPreview,
  detectDncWorkwearCatalog,
  detectFashionBizVariantCatalog,
  detectGoldCatalogFormat,
  expandDncWorkwearCatalogToTemplate,
  expandFashionBizCatalogToTemplate,
  expandGoldCatalogToTemplate,
  normalizeSpreadsheetForImport,
  slugifyCollectionHandle,
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
  it("slugifyCollectionHandle produces stable handles", () => {
    expect(slugifyCollectionHandle("Summer 2026 — Basics")).toBe("summer-2026-basics")
    expect(slugifyCollectionHandle("   ")).toBe("collection")
  })

  it("applyDefaultCollectionIdToParsedCsv fills empty Product Collection Id cells", () => {
    const r = emptyRow()
    r["product handle"] = "a"
    r["product title"] = "A"
    r["shipping profile id"] = "sp_x"
    r["variant sku"] = "SKU1"
    r["variant price aud"] = "10"
    const r2 = emptyRow()
    r2["product handle"] = "b"
    r2["product title"] = "B"
    r2["shipping profile id"] = "sp_x"
    r2["variant sku"] = "SKU2"
    r2["variant price aud"] = "20"
    r2["product collection id"] = "pcol_keep"

    const parsed = parseCsv(buildCsv([r, r2]))
    const stamped = applyDefaultCollectionIdToParsedCsv(parsed, "pcol_new")

    expect(stamped.rows[0]!["product collection id"]).toBe("pcol_new")
    expect(stamped.rows[1]!["product collection id"]).toBe("pcol_keep")
  })

  it("computeSpreadsheetPreview flags rows missing variant pricing (matches sync validation)", () => {
    const r = emptyRow()
    r["product handle"] = "acme-shirt"
    r["product title"] = "Acme Shirt"
    r["product status"] = "published"
    r["shipping profile id"] = "sp_test"
    r["variant sku"] = "ACM-NO-PRICE"
    r["variant title"] = "M"
    r["variant option 1 name"] = "Size"
    r["variant option 1 value"] = "M"

    const parsed = parseCsv(buildCsv([r]))
    const preview = computeSpreadsheetPreview(parsed)

    expect(preview.validationErrors.some((e) => e.includes("Variant Price AUD"))).toBe(true)
    const { errors } = buildBatchCreatesFromParsedCsv(parsed)
    expect(errors.some((e) => e.includes("Variant Price AUD"))).toBe(true)
  })

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

  it("buildBatchCreatesFromParsedCsv derives AUD tiers from Variant Price AUD alone (100+ anchor)", () => {
    const r = emptyRow()
    r["product handle"] = "anchor-shirt"
    r["product title"] = "Anchor Shirt"
    r["product status"] = "published"
    r["shipping profile id"] = "sp_test"
    r["variant sku"] = "ANCH-001"
    r["variant title"] = "M"
    r["variant option 1 name"] = "Size"
    r["variant option 1 value"] = "M"
    r["variant price aud"] = "8"

    const parsed = parseCsv(buildCsv([r]))
    const { tierBySku, errors } = buildBatchCreatesFromParsedCsv(parsed)

    expect(errors.length).toBe(0)
    expect(tierBySku.has("ANCH-001")).toBe(true)
    const t = tierBySku.get("ANCH-001")!
    expect(t.t100_plus).toBe(800)
    expect(t.t1_9).toBeGreaterThan(t.t100_plus)
  })

  it("buildBatchCreatesFromParsedCsv builds one product with supplemental tier columns", () => {
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
      t1_9: 10000,
      t10_19: 9500,
      t20_49: 9500,
      t50_99: 9000,
      t100_plus: 8500,
    })
  })

  it("buildBatchCreatesFromParsedCsv omits barcode on duplicates (first occurrence wins)", () => {
    const dup = "1.98057E+11"
    const a = emptyRow()
    a["product handle"] = "dedupe-bc"
    a["product title"] = "Dedupe Barcode Demo"
    a["product status"] = "published"
    a["shipping profile id"] = "sp_test"
    a["variant sku"] = "SKU-FIRST"
    a["variant barcode"] = dup
    a["variant title"] = "M"
    a["variant option 1 name"] = "Size"
    a["variant option 1 value"] = "M"
    a["variant price aud"] = "12"

    const b = emptyRow()
    Object.assign(b, a)
    b["variant sku"] = "SKU-SECOND"
    b["variant option 1 value"] = "L"

    const parsed = parseCsv(buildCsv([a, b]))
    const { creates, errors, warnings } = buildBatchCreatesFromParsedCsv(parsed)

    expect(errors.length).toBe(0)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some((w) => w.includes("duplicate barcode"))).toBe(true)
    const vars = creates[0]?.variants as Array<{ sku: string; barcode?: string }>
    expect(vars?.length).toBe(2)
    expect(vars?.[0]?.barcode).toBe(dup)
    expect(vars?.[1]?.barcode).toBeUndefined()
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
    const prev = computeSpreadsheetPreview(exp)
    expect(prev.validationErrors.length).toBe(0)
    expect(prev.tierRuleCount).toBe(2)

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

  it("expandFashionBizCatalogToTemplate reads AUD from loosely named price columns", () => {
    const raw =
      "sku,style_code,size,colour,Supplier Line Sell AUD inc GST\nA,P1,M,Navy,18.50\nB,P1,L,Navy,18.50"
    const parsed = parseCsv(raw)
    const exp = expandFashionBizCatalogToTemplate(parsed, "sp_test")
    expect(exp.rows[0]?.["variant price aud"]).toBe("18.50")
  })

  it("expandFashionBizCatalogToTemplate fills variant price from first row of style when others omit price", () => {
    const raw = "sku,style_code,size,colour,price\nA,P1,M,Navy,12.00\nB,P1,L,Navy,\nC,P1,M,Red,"
    const parsed = parseCsv(raw)
    const exp = expandFashionBizCatalogToTemplate(parsed, "sp_test")
    expect(exp.rows.length).toBe(3)
    expect(exp.rows[0]?.["variant price aud"]).toBe("12.00")
    expect(exp.rows[1]?.["variant price aud"]).toBe("12.00")
    expect(exp.rows[2]?.["variant price aud"]).toBe("12.00")
  })

  it("normalizeSpreadsheetForImport requires shipping profile for FashionBiz CSV", () => {
    const parsed = parseCsv(`${FASHIONBIZ_HEADER}\nA,P3225,M,Navy,10,Polo`)
    expect(normalizeSpreadsheetForImport(parsed, {}).readyParsed).toBeNull()
    expect(
      normalizeSpreadsheetForImport(parsed, { defaultShippingProfileId: "sp_x" }).readyParsed?.rows.length
    ).toBe(1)
  })

  const DNC_HEADER =
    "ProductCode,Description,Description2,Description3,Barcode,Image,URL,Condition,Price,Picture 1,Picture 2,Picture 3"

  it("detects DNC Workwear CSV shape when dnc URLs are present", () => {
    const raw = `${DNC_HEADER}
1101,Parent Tee,,,,https://cdn.dncworkwear.com.au/x.jpg,https://www.dncworkwear.com.au/Product/1101,,$22.50,,,
SKUB,Child Blue M,Blue,M,931111,https://cdn.dncworkwear.com.au/y.jpg,,,$22.50,,`
    const parsed = parseCsv(raw)
    expect(detectDncWorkwearCatalog(parsed)).toBe(true)
  })

  it("does not detect DNC when URL fingerprint is missing", () => {
    const raw = `${DNC_HEADER}
1101,Parent,,,,http://othersupplier.example/l.jpg,,,$1,,`
    expect(detectDncWorkwearCatalog(parseCsv(raw))).toBe(false)
  })

  it("expandDncWorkwearCatalogToTemplate maps summary + variants", () => {
    const raw = `${DNC_HEADER}
1101,Chef Jacket SS,,,,https://cdn.dncworkwear.com.au/p.jpg,https://www.dncworkwear.com.au/Product/1101,,$20.30,,,
110110061,Chef Jacket SS Black XXS,Black,XXS,9335975124903,https://cdn.dncworkwear.com.au/v.jpg,,,$20.30,,`
    const parsed = parseCsv(raw)
    const exp = expandDncWorkwearCatalogToTemplate(parsed, "sp_dnc")
    expect(exp.rows.length).toBe(1)
    expect(exp.rows[0]?.["product handle"]).toBe("dnc-1101")
    expect(exp.rows[0]?.["product title"]).toBe("Chef Jacket SS")
    expect(exp.rows[0]?.["variant sku"]).toBe("110110061")
    expect(exp.rows[0]?.["variant barcode"]).toBe("9335975124903")
    expect(exp.rows[0]?.["variant option 1 value"]).toBe("XXS")
    expect(exp.rows[0]?.["variant option 2 value"]).toBe("Black")
    expect(computeSpreadsheetPreview(exp).validationErrors.length).toBe(0)
  })

  it("normalizeSpreadsheetForImport requires shipping profile for DNC CSV", () => {
    const raw = `${DNC_HEADER}
1101,Chef Jacket SS,,,,https://cdn.dncworkwear.com.au/p.jpg,https://www.dncworkwear.com.au/Product/1101,,20.30,,,
110110061,Jacket Black XXS,Black,XXS,9335975124903,https://cdn.dncworkwear.com.au/v.jpg,,,,20.30,,`
    const parsed = parseCsv(raw)
    expect(normalizeSpreadsheetForImport(parsed, {}).readyParsed).toBeNull()
    expect(
      normalizeSpreadsheetForImport(parsed, { defaultShippingProfileId: "sp_z" }).readyParsed?.rows.length
    ).toBe(1)
  })
})
