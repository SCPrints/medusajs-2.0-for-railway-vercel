import { computeCartWeight } from "../cart-weight"
import { cleanHomeAddress, homeAddressLine, isHomeDeliveryOnlyCart, parcelGrams } from "../home-delivery"
import { buyerUnitPrice, storeFundraising, summariseRun } from "../team-store"
import { stripServerTrustMetadata } from "../client-line-metadata"
import { supplierPackDoc } from "../../services/customer-docs/supplier-pack"

describe("home delivery", () => {
  const good = { name: "Sam Lee", address_1: "1 Main St", city: "Dubbo", province: "nsw", postal_code: "2830" }

  it("takes a full Australian address and refuses gaps", () => {
    const r = cleanHomeAddress(good)
    expect(r.ok && r.address.province).toBe("NSW")
    expect(r.ok && homeAddressLine(r.address)).toBe("1 Main St, Dubbo NSW 2830")
    expect(cleanHomeAddress({ ...good, postal_code: "28" })).toEqual({ ok: false, error: "Enter a 4-digit postcode." })
    expect(cleanHomeAddress({ ...good, province: "XX" })).toEqual({ ok: false, error: "Choose the state." })
    expect(cleanHomeAddress(null).ok).toBe(false)
  })

  it("free cart shipping only when every line is home delivery AND the postage line is there", () => {
    const garment = { metadata: { home_delivery: true } }
    const postage = { metadata: { home_delivery: true, home_delivery_postage: true } }
    expect(isHomeDeliveryOnlyCart([garment, postage])).toBe(true)
    expect(isHomeDeliveryOnlyCart([garment])).toBe(false) // postage line removed: normal shipping
    expect(isHomeDeliveryOnlyCart([garment, postage, { metadata: {} }])).toBe(false)
  })

  it("weighs only the lines that ship in the cart's own parcel", () => {
    const tee = { quantity: 2, metadata: {}, variant: { weight: 200 } }
    const gift = { quantity: 5, metadata: { home_delivery: true }, variant: { weight: 200 } }
    const postage = { quantity: 1, metadata: { home_delivery: true, home_delivery_postage: true } }
    const names = { quantity: 10, metadata: { names_numbers: { names: "up_to_a4" } } }
    expect(computeCartWeight({ items: [tee, gift, postage, names] }, 150, 300).itemsWeightGrams).toBe(400)
    // No postage line: the gift garments are weighed like any other line.
    expect(computeCartWeight({ items: [tee, gift] }, 150, 300).itemsWeightGrams).toBe(1400)
    expect(parcelGrams([200, 550], 150)).toBe(900)
  })

  it("can't be forged from the browser", () => {
    expect(stripServerTrustMetadata({ home_delivery: true, home_delivery_postage: true, product_handle: "x" })).toEqual({ product_handle: "x" })
  })
})

describe("team store fundraising", () => {
  it("adds the per-item amount to the price, capped and rounded", () => {
    expect(storeFundraising({ metadata: { fundraising_per_item: 5 } })).toBe(5)
    expect(storeFundraising({ metadata: { fundraising_per_item: -2 } })).toBe(0)
    expect(storeFundraising({ metadata: { fundraising_per_item: 500 } })).toBe(100)
    expect(storeFundraising(null)).toBe(0)
    expect(buyerUnitPrice("32.5", 5)).toBe(37.5)
  })

  it("totals what was raised across the run", () => {
    const line = (qty: number, extra: Record<string, unknown> = {}) => ({
      quantity: qty,
      unit_price: 37.5,
      metadata: { team_store_id: "ts_1", team_store_item_id: "i1", team_store_size: "M", ...extra },
    })
    const run = summariseRun("ts_1", [
      { id: "o1", items: [line(2, { team_store_fundraising: 5 })] },
      { id: "o2", items: [line(1, { team_store_fundraising: 5 })] },
      { id: "o3", status: "canceled", items: [line(4, { team_store_fundraising: 5 })] },
    ])
    expect(run.units).toBe(3)
    expect(run.revenue).toBe(112.5)
    expect(run.fundraising).toBe(15)
  })
})

describe("supplier details PDF", () => {
  const base = { abn: "19 608 129 318", address: "1 Shop St, Sydney NSW 2000", phone: null, documents: [], to: ["AAF"], date: "25 November 2026" }

  it("shows bank details only when they are set", () => {
    const withBank = supplierPackDoc({ ...base, bank: { name: "SC Prints", bsb: "000-000", account: "12345678" } })
    expect(withBank.tables[1].heading).toBe("Paying us by bank transfer")
    expect(withBank.tables[1].rows.map((r) => r[0])).toContain("BSB")
    const noBank = supplierPackDoc({ ...base, bank: null })
    expect(noBank.tables[1].rows.map((r) => r[0])).not.toContain("BSB")
    expect(noBank.tables[0].rows).toContainEqual(["ABN", "19 608 129 318"])
  })

  it("lists the certificates when there are any", () => {
    const doc = supplierPackDoc({ ...base, bank: null, documents: [{ title: "Insurance", url: "https://x/ins.pdf" }] })
    expect(doc.tables[2].rows).toEqual([["Insurance", "https://x/ins.pdf"]])
    expect(supplierPackDoc({ ...base, bank: null }).tables).toHaveLength(2)
  })
})
