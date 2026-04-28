import {
  buildProductImportTemplateRows,
  PRODUCT_IMPORT_CSV_HEADERS,
} from "../product-import-template-csv"

describe("product-import-template-csv", () => {
  it("exports header length matching template plus supplemental columns", () => {
    expect(PRODUCT_IMPORT_CSV_HEADERS).toHaveLength(46)
    expect(PRODUCT_IMPORT_CSV_HEADERS[0]).toBe("Product Id")
    expect(PRODUCT_IMPORT_CSV_HEADERS[41]).toBe("Product Image 2 Url")
    expect(PRODUCT_IMPORT_CSV_HEADERS[42]).toBe("Product Collection Title")
  })

  it("builds one row per variant and skips products without variants", () => {
    const rows = buildProductImportTemplateRows([
      {
        id: "prod_1",
        handle: "h",
        title: "T",
        status: "published",
        discountable: true,
        variants: [
          {
            id: "variant_1",
            title: "Default",
            sku: "SKU1",
            allow_backorder: false,
            manage_inventory: true,
            prices: [{ amount: 1000, currency_code: "usd" }],
            options: [],
          },
        ],
        tags: [{ id: "tag_1", value: "Summer" }],
        sales_channels: [{ id: "sc_1", name: "Default Sales Channel" }],
        collection: { id: "col_1", title: "C1" },
        type: { id: "typ_1", value: "shirt" },
        images: [{ url: "https://a.example/x.png", rank: 0 }],
      },
      { id: "prod_empty", handle: "x", title: "No variants", variants: [] },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0][0]).toBe("prod_1")
    expect(rows[0][22]).toBe("variant_1")
    expect(rows[0][36]).toBe("") // EUR empty in fixture
    expect(rows[0][37]).toBe("10") // USD minor (1000) → major
    expect(rows[0][40]).toBe("https://a.example/x.png") // Product Image 1 Url
    expect(rows[0][42]).toBe("C1")
    expect(rows[0][43]).toBe("shirt")
    expect(rows[0][44]).toBe("sc_1")
    expect(rows[0][45]).toBe("tag_1")
  })
})
