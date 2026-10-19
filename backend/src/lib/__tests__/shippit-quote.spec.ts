import {
  customerAmountFromCarrierPrice,
  pickStandardQuote,
  shippitParcels,
  shippitSuburb,
} from "../shippit-quote"

describe("shippit-quote", () => {
  it("picks the cheapest successful non-zero standard quote", () => {
    // Real shape from the 2026-10-19 probe (Brisbane City, 3 kg).
    const json = {
      response: [
        { service_level: "on_demand", courier_type: "OnDemand", success: false, quotes: [] },
        { service_level: "standard", courier_type: "Tnt", success: true, quotes: [{ price: 32.06 }] },
        {
          service_level: "standard",
          courier_type: "AramexAuNz",
          success: true,
          quotes: [{ price: 14.24, estimated_transit_time: "2 business days" }],
        },
        { service_level: "standard", courier_type: "Broken", success: false, error: "x", quotes: [{ price: 1 }] },
        { service_level: "express", courier_type: "TntOvernightExpress", success: true, quotes: [{ price: 32.38 }] },
        { service_level: "click_and_collect", courier_type: "ClickAndCollect", success: true, quotes: [{ price: 0 }] },
      ],
    }
    expect(pickStandardQuote(json)).toEqual({
      carrier_price: 14.24,
      courier: "AramexAuNz",
      transit: "2 business days",
    })
  })

  it("returns only the requested courier when one is named (website = AusPost)", () => {
    const json = {
      response: [
        { service_level: "standard", courier_type: "AramexAuNz", success: true, quotes: [{ price: 8.76 }] },
        { service_level: "standard", courier_type: "MyPostBusinessStandard", success: true, quotes: [{ price: 18.95 }] },
        { service_level: "express", courier_type: "MyPostBusinessExpress", success: true, quotes: [{ price: 22.95 }] },
      ],
    }
    expect(pickStandardQuote(json, "MyPostBusinessStandard")).toEqual({
      carrier_price: 18.95,
      courier: "MyPostBusinessStandard",
      transit: undefined,
    })
    // AusPost absent (e.g. errored) → null, never a silent fall-through to Aramex
    expect(pickStandardQuote({ response: [json.response[0]] }, "MyPostBusinessStandard")).toBeNull()
  })

  it("returns null when every carrier refused or the shape is wrong", () => {
    expect(pickStandardQuote({ response: [{ service_level: "standard", success: false }] })).toBeNull()
    expect(pickStandardQuote({ response: [{ service_level: "standard", success: true, quotes: [{ price: 0 }] }] })).toBeNull()
    expect(pickStandardQuote({ error: "bad_request" })).toBeNull()
    expect(pickStandardQuote(null)).toBeNull()
  })

  it("rounds the inc-GST carrier price up to whole dollars (no gross-up, no freight-in)", () => {
    // Shippit's price already includes GST (price_breakdown has a `gst` line).
    expect(customerAmountFromCarrierPrice(8.76)).toBe(9) // Sydney 1 kg
    expect(customerAmountFromCarrierPrice(32.06)).toBe(33) // Dubbo
    expect(customerAmountFromCarrierPrice(20)).toBe(20)
    // multi-carton: per-parcel price × parcel count (10 cartons @ $29.15 → $292)
    expect(customerAmountFromCarrierPrice(29.15, 10)).toBe(292)
    expect(customerAmountFromCarrierPrice(18.95, 0)).toBe(19)
  })

  it("splits heavy carts into ≤10 kg cartons and floors tiny ones at 0.1 kg", () => {
    expect(shippitParcels(3000)).toEqual([{ qty: 1, weight: 3 }])
    expect(shippitParcels(10000)).toEqual([{ qty: 1, weight: 10 }])
    expect(shippitParcels(15000)).toEqual([{ qty: 2, weight: 7.5 }])
    // 500 tees @ 200 g + 150 g packaging → 11 cartons, not 6
    expect(shippitParcels(100150)).toEqual([{ qty: 11, weight: 9.1 }])
    expect(shippitParcels(0)).toEqual([{ qty: 1, weight: 0.1 }])
  })

  it("maps the capitals whose common name misses Shippit's gazetteer", () => {
    expect(shippitSuburb("Brisbane")).toBe("Brisbane City")
    expect(shippitSuburb(" darwin ")).toBe("Darwin City")
    expect(shippitSuburb("Parramatta")).toBe("Parramatta")
    expect(shippitSuburb(null)).toBe("")
  })
})
