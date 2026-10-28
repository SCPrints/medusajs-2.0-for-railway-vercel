import { toProductSearchDocument } from "../search-product-document"

const level = (location_id: string, stocked_quantity: number, reserved_quantity = 0) => ({
  location_id,
  stocked_quantity,
  reserved_quantity,
})
const stocked = (levels: ReturnType<typeof level>[], required_quantity = 1) => ({
  manage_inventory: true,
  inventory_items: [{ required_quantity, inventory: { location_levels: levels } }],
})
const channels = [{ id: "sc_1", stock_locations: [{ id: "sloc_shop" }] }]

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
      sales_channels: channels,
      variants: [
        { sku: "A", metadata: { bulk_pricing: { tiers: [{ amount: 21.5 }] } }, ...stocked([level("sloc_shop", 0)]) },
        { sku: "B", price_set: { prices: [{ amount: 19, currency_code: "aud", rules_count: 0, min_quantity: 1 }] }, ...stocked([level("sloc_shop", 4)]) },
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
    const doc = toProductSearchDocument({ id: "prod_2", sales_channels: channels, variants: [stocked([level("sloc_shop", 0)])] })
    expect(doc).not.toHaveProperty("min_price_aud")
  })

  it.each([
    ["stock at the shop's location", [stocked([level("sloc_shop", 3)])], true],
    ["no stock anywhere", [stocked([level("sloc_shop", 0)])], false],
    ["stock only at a location the shop doesn't sell from", [stocked([level("sloc_other", 50)])], false],
    ["all stock reserved", [stocked([level("sloc_shop", 5, 5)])], false],
    ["fewer units than one variant needs", [stocked([level("sloc_shop", 1)], 2)], false],
    ["stock not tracked", [{ manage_inventory: false }], true],
    ["backorders allowed", [{ ...stocked([level("sloc_shop", 0)]), allow_backorder: true }], true],
    ["tracked but no inventory item (unknown)", [{ manage_inventory: true }], true],
  ])("in_stock: %s", (_label, variants, expected) => {
    expect(toProductSearchDocument({ id: "p", sales_channels: channels, variants }).in_stock).toBe(expected)
  })
})

describe("searchable names, colours and popularity", () => {
  it("indexes type/category/tag names, colour words and the popularity score", () => {
    const doc = toProductSearchDocument({
      id: "prod_2",
      title: "Supply Hood",
      type: { id: "ptyp_1", value: "Hoodies" },
      categories: [{ id: "c1", name: "Hoodies" }, { id: "c2", name: "Zip Up Hoodies" }],
      tags: [{ id: "t1", value: "Men" }, { id: "t2", value: "Unisex" }],
      metadata: { sales_90d: 40, search_boost: true },
      variants: [
        { title: "Black / XL" }, { title: "Black / 2XL" }, { title: "Heather Grey / S" },
        { title: "Navy / 10" }, { title: "Default variant" }, { title: "Cargo Pants R/Tape Blue 87R" },
      ],
    })
    expect(doc).toMatchObject({
      type_name: "hoodies",
      category_names: "hoodies zip up hoodies",
      tag_names: "men unisex",
      colours: "black heather grey navy",
      popularity: 100040,
    })
  })
})
