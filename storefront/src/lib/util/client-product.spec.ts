import { toClientProduct } from "./client-product"

const fatProduct: any = {
  id: "prod_1",
  handle: "tee",
  title: "Tee",
  description: "desc",
  metadata: { print_profile: "short-sleeve-garment" },
  weight: 180,
  options: [
    {
      id: "opt_1",
      title: "Colour",
      product_id: "prod_1",
      created_at: "x",
      updated_at: "x",
      values: [{ id: "val_1", value: "Black", option_id: "opt_1", created_at: "x" }],
    },
  ],
  images: [{ id: "img_1", url: "https://cdn/a.jpg", rank: 0, created_at: "x" }],
  variants: [
    {
      id: "variant_1",
      title: "Black / M",
      sku: "5001-BLK-M",
      product_id: "prod_1",
      manage_inventory: true,
      allow_backorder: false,
      inventory_quantity: 12,
      created_at: "x",
      updated_at: "x",
      deleted_at: null,
      hs_code: null,
      origin_country: null,
      width: null,
      barcode: "123",
      metadata: { bulk_pricing: { tiers: [] }, cost_price_ex_gst_minor: 800 },
      options: [
        {
          id: "vo_1",
          value: "Black",
          option_id: "opt_1",
          created_at: "x",
          option: { id: "opt_1", title: "Colour", product_id: "prod_1", created_at: "x" },
        },
      ],
      calculated_price: {
        id: "pset_1",
        calculated_amount: 32.49,
        raw_calculated_amount: { value: "32.49", precision: 20 },
        original_amount: 32.49,
        raw_original_amount: { value: "32.49", precision: 20 },
        currency_code: "aud",
        is_calculated_price_price_list: false,
        is_calculated_price_tax_inclusive: true,
        is_original_price_price_list: false,
        is_original_price_tax_inclusive: true,
        calculated_price: { id: "p_1", price_list_id: null, price_list_type: null, min_quantity: null, max_quantity: null },
        original_price: { id: "p_1", price_list_id: null, price_list_type: null },
      },
    },
  ],
}

describe("toClientProduct", () => {
  const slim: any = toClientProduct(fatProduct)

  it("keeps every field client code reads", () => {
    expect(slim.id).toBe("prod_1")
    expect(slim.metadata.print_profile).toBe("short-sleeve-garment")
    expect(slim.weight).toBe(180)
    const v = slim.variants[0]
    expect(v.id).toBe("variant_1")
    expect(v.sku).toBe("5001-BLK-M")
    expect(v.inventory_quantity).toBe(12)
    expect(v.metadata.bulk_pricing).toEqual({ tiers: [] })
    expect(v.options[0].option.title).toBe("Colour")
    expect(v.options[0].option_id).toBe("opt_1")
    expect(v.calculated_price.calculated_amount).toBe(32.49)
    expect(v.calculated_price.currency_code).toBe("aud")
    expect(v.calculated_price.calculated_price.price_list_type).toBeNull()
    expect(slim.options[0].values[0].value).toBe("Black")
    expect(slim.images[0].url).toBe("https://cdn/a.jpg")
  })

  it("strips the per-variant dead weight", () => {
    const v = slim.variants[0]
    for (const k of ["created_at", "updated_at", "deleted_at", "hs_code", "origin_country", "width", "barcode"]) {
      expect(v).not.toHaveProperty(k)
    }
    expect(v.calculated_price).not.toHaveProperty("raw_calculated_amount")
    expect(v.calculated_price).not.toHaveProperty("original_price")
    expect(v.calculated_price.calculated_price).not.toHaveProperty("min_quantity")
    expect(v.options[0]).not.toHaveProperty("created_at")
    expect(v.options[0].option).not.toHaveProperty("product_id")
    expect(slim.images[0]).not.toHaveProperty("created_at")
    expect(slim.options[0]).not.toHaveProperty("created_at")
  })

  it("is materially smaller", () => {
    // Real variants are ~2.6KB → ~1KB; this fixture is small so the ratio is
    // gentler, but the direction must hold.
    expect(JSON.stringify(slim.variants[0]).length).toBeLessThan(
      JSON.stringify(fatProduct.variants[0]).length * 0.75
    )
  })

  it("does not mutate the input", () => {
    expect(fatProduct.variants[0]).toHaveProperty("created_at")
  })
})
