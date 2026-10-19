import {
  allowlistClientLineMetadata,
  stripServerTrustMetadata,
} from "../client-line-metadata"
import { stripLineItemTrustMetadataMiddleware } from "../../api/middlewares/strip-line-item-trust-metadata"

const poisoned = () => ({
  customizerDesign: {
    artifacts: [{ side: "front", print_size_id: "up_to_a6" }],
    pricing: {
      client: { estimate: 30 },
      server: { garment_unit_major: 0.01, print_size_id: "up_to_a6" },
    },
  },
  product_handle: "staple-tee",
  quote_locked_price: true,
  price_override: { by: "attacker", reason: "lol" },
  decorationDesign: { stitches: 1 },
  vectorization_for_order: true,
  dtfGangsheetSheetSize: "30cm × 40cm",
})

describe("allowlistClientLineMetadata (scp add descriptor)", () => {
  it("keeps customizerDesign + owned keys, drops the rest, and removes pricing.server", () => {
    const { metadata, dropped } = allowlistClientLineMetadata(poisoned())
    expect(metadata.customizerDesign).toEqual({
      artifacts: [{ side: "front", print_size_id: "up_to_a6" }],
      pricing: { client: { estimate: 30 } },
    })
    expect(metadata.product_handle).toBe("staple-tee")
    for (const k of ["quote_locked_price", "price_override", "decorationDesign", "vectorization_for_order", "dtfGangsheetSheetSize"]) {
      expect(metadata).not.toHaveProperty(k)
    }
    expect(dropped.sort()).toEqual(
      ["decorationDesign", "dtfGangsheetSheetSize", "price_override", "quote_locked_price", "vectorization_for_order"].sort()
    )
  })

  it("keeps the server-side bundle and group-order keys", () => {
    const { metadata, dropped } = allowlistClientLineMetadata({
      bundle_id: "b1",
      bundle_item_id: "bi1",
      artwork_url: "https://r2/a.png",
      printNotes: "left chest",
      group_order_id: "go1",
      group_order_participants: [{ id: "p1" }],
    })
    expect(dropped).toEqual([])
    expect(Object.keys(metadata).sort()).toEqual(
      ["artwork_url", "bundle_id", "bundle_item_id", "group_order_id", "group_order_participants", "printNotes"].sort()
    )
  })

  it("tolerates missing / non-object metadata", () => {
    expect(allowlistClientLineMetadata(undefined)).toEqual({ metadata: {}, dropped: [] })
    expect(allowlistClientLineMetadata("nope")).toEqual({ metadata: {}, dropped: [] })
  })
})

describe("stripServerTrustMetadata (core line-items routes)", () => {
  it("deletes only the trust keys and pricing.server", () => {
    const out = stripServerTrustMetadata(poisoned())!
    expect(out).not.toHaveProperty("quote_locked_price")
    expect(out).not.toHaveProperty("price_override")
    expect(out).not.toHaveProperty("decorationDesign")
    expect((out.customizerDesign as any).pricing).toEqual({ client: { estimate: 30 } })
    expect(out.vectorization_for_order).toBe(true)
    expect(out.dtfGangsheetSheetSize).toBe("30cm × 40cm")
  })

  it("returns undefined for non-object metadata", () => {
    expect(stripServerTrustMetadata(undefined)).toBeUndefined()
    expect(stripServerTrustMetadata(null)).toBeUndefined()
  })
})

describe("stripLineItemTrustMetadataMiddleware", () => {
  it("strips req.body.metadata and req.validatedBody.metadata, then calls next", () => {
    const req: any = {
      body: { variant_id: "v1", quantity: 2, metadata: poisoned() },
      validatedBody: { variant_id: "v1", quantity: 2, metadata: poisoned() },
    }
    const next = jest.fn()

    stripLineItemTrustMetadataMiddleware(req, {} as any, next)

    for (const b of [req.body, req.validatedBody]) {
      expect(b.metadata).not.toHaveProperty("quote_locked_price")
      expect(b.metadata).not.toHaveProperty("price_override")
      expect(b.metadata).not.toHaveProperty("decorationDesign")
      expect(b.metadata.customizerDesign.pricing).not.toHaveProperty("server")
      expect(b.metadata.vectorization_for_order).toBe(true)
      expect(b.quantity).toBe(2)
    }
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("leaves a body without metadata alone", () => {
    const req: any = { body: { quantity: 3 } }
    const next = jest.fn()
    stripLineItemTrustMetadataMiddleware(req, {} as any, next)
    expect(req.body).toEqual({ quantity: 3 })
    expect(next).toHaveBeenCalledTimes(1)
  })
})
