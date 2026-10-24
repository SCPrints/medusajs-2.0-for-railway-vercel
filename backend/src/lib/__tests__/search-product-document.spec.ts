import { toProductSearchDocument } from "../search-product-document"

describe("toProductSearchDocument", () => {
  it("builds listing facets from the product graph", () => {
    const doc = toProductSearchDocument({
      id: "prod_1",
      title: "Staple Tee",
      created_at: "2026-01-01T00:00:00Z",
      material: "100% Cotton Jersey",
      categories: [{ id: "pcat_1" }],
      tags: [{ id: "ptag_1" }],
      type: { id: "ptyp_1" },
      brand: { handle: "as-colour", name: "AS Colour" },
      metadata: {},
      variants: [
        { sku: "A", metadata: { bulk_pricing: { tiers: [{ amount: 21.5 }] } }, inventory_quantity: 0, manage_inventory: true },
        { sku: "B", price_set: { prices: [{ amount: 19, currency_code: "aud", rules_count: 0, min_quantity: 1 }] }, inventory_quantity: 4 },
      ],
    })
    expect(doc).toMatchObject({
      min_price_aud: 1900,
      in_stock: true,
      variant_sku: "A B",
      category_ids: ["pcat_1"],
      brand_handle: "as-colour",
      brand_name: "as colour",
      fabric: ["100", "cotton", "jersey"],
      material_text: "100% cotton jersey",
      internal_service: false,
      created_at_ts: Date.parse("2026-01-01T00:00:00Z"),
    })
  })

  it("omits the price when no variant has one, so it sorts last", () => {
    const doc = toProductSearchDocument({ id: "prod_2", variants: [{ inventory_quantity: 0, manage_inventory: true }] })
    expect(doc).not.toHaveProperty("min_price_aud")
    expect(doc.in_stock).toBe(false)
  })
})
