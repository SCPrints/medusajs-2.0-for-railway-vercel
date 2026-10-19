import {
  stripVariantCostMetadata,
  stripVariantCostMetadataMiddleware,
} from "../strip-variant-cost-metadata"

const costedVariant = (id: string) => ({
  id,
  metadata: {
    bulk_pricing: { tiers: [{ min_quantity: 100, amount: 20.87 }] },
    cost_price_ex_gst_minor: 1265,
    raw_prices: [{ qty: "1-99", price: 12.65 }],
    cost_adjustment: 1.15,
    garment_images: { front: "https://cdn/front.jpg" },
  },
})

describe("stripVariantCostMetadata", () => {
  it("strips the three cost keys and keeps bulk_pricing on a product list", () => {
    const body = { products: [{ id: "p1", variants: [costedVariant("v1"), costedVariant("v2")] }], count: 1 }
    stripVariantCostMetadata(body)
    for (const v of body.products[0].variants) {
      expect(v.metadata).not.toHaveProperty("cost_price_ex_gst_minor")
      expect(v.metadata).not.toHaveProperty("raw_prices")
      expect(v.metadata).not.toHaveProperty("cost_adjustment")
      expect(v.metadata.bulk_pricing).toEqual({ tiers: [{ min_quantity: 100, amount: 20.87 }] })
      expect(v.metadata.garment_images).toEqual({ front: "https://cdn/front.jpg" })
    }
  })

  it("handles the single-product and bundle `{ handle: product }` shapes", () => {
    const single = { product: { id: "p1", variants: [costedVariant("v1")] } }
    stripVariantCostMetadata(single)
    expect(single.product.variants[0].metadata).not.toHaveProperty("cost_price_ex_gst_minor")

    const bundle = { bundle: { id: "b1" }, products: { tee: { id: "p1", variants: [costedVariant("v1")] } } }
    stripVariantCostMetadata(bundle)
    expect(bundle.products.tee.variants[0].metadata).not.toHaveProperty("raw_prices")
  })

  it("leaves bodies without variants, null metadata and non-objects alone", () => {
    expect(stripVariantCostMetadata({ ok: true })).toEqual({ ok: true })
    expect(stripVariantCostMetadata(null)).toBeNull()
    const body = { products: [{ id: "p1", variants: [{ id: "v1", metadata: null }, { id: "v2" }] }] }
    expect(() => stripVariantCostMetadata(body)).not.toThrow()
  })
})

describe("stripVariantCostMetadataMiddleware", () => {
  it("wraps res.json so the handler's body is stripped before it is sent", () => {
    const sent: unknown[] = []
    const res = { json: jest.fn((body: unknown) => sent.push(body)) }
    const next = jest.fn()

    stripVariantCostMetadataMiddleware({} as any, res as any, next)
    expect(next).toHaveBeenCalledTimes(1)

    res.json({ products: [{ id: "p1", variants: [costedVariant("v1")] }] })
    const out = sent[0] as { products: Array<{ variants: Array<{ metadata: Record<string, unknown> }> }> }
    expect(out.products[0].variants[0].metadata).toEqual({
      bulk_pricing: { tiers: [{ min_quantity: 100, amount: 20.87 }] },
      garment_images: { front: "https://cdn/front.jpg" },
    })
  })
})
