import { AS_COLOUR_NAME, AUSSIE_PACIFIC_NAME, noSkuForSupplier } from "../sizes-pending"

const AS = { handlePrefix: "as-colour-", name: AS_COLOUR_NAME }
const AP = { handlePrefix: "aussie-pacific-", name: AUSSIE_PACIFIC_NAME }
const order = (items: any[]) => ({ id: "order_1", display_id: 123, items })

describe("noSkuForSupplier", () => {
  it("flags free-text AS Colour garments (#120, #123)", () => {
    const got = noSkuForSupplier(
      order([
        { title: "AS Colour Classic Tee 5026 - Black", quantity: 12, variant_sku: null, metadata: {} },
        { title: "ASC Staple minus 2 position print", quantity: 20, variant_sku: null, metadata: {} },
        { title: "Embroidery digitising (one-off setup)", quantity: 1, variant_sku: null, metadata: {} },
        { title: "Staple Tee — Black / L", quantity: 3, variant_sku: "5001-BLACK-L", metadata: {} },
      ]),
      AS,
      "Pat"
    )
    expect(got?.lines.map((l) => l.title)).toEqual(["AS Colour Classic Tee 5026 - Black", "ASC Staple minus 2 position print"])
  })

  it("skips customer-supplied and sizes-to-come lines, and other suppliers", () => {
    const items = [
      { title: "AS Colour Staple Tee — customer supplied", quantity: 5, metadata: {} },
      { title: "Staple Tee — BLACK (any size)", quantity: 5, metadata: { sizes_pending: { product_handle: "as-colour-staple-tee-5001" }, product_handle: "as-colour-staple-tee-5001" } },
      { title: "AP Premier Singlets", quantity: 10, metadata: {} },
    ]
    expect(noSkuForSupplier(order(items), AS, "Pat")).toBeNull()
    expect(noSkuForSupplier(order(items), AP, "Pat")?.lines).toEqual([{ title: "AP Premier Singlets", quantity: 10 }])
  })

  it("catches a supplier handle with no SKU even when the title doesn't name the brand", () => {
    const got = noSkuForSupplier(order([{ title: "Staple Tee", quantity: 2, metadata: { product_handle: "as-colour-staple-tee-5001" } }]), AS, "Pat")
    expect(got?.lines).toHaveLength(1)
  })
})
