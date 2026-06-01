import { computeCartWeight } from "../cart-weight"

const OVERHEAD = 150
const DEFAULT = 300

describe("computeCartWeight — default-garment-weight fallback", () => {
  it("applies the per-unit default to weightless items so weight scales with quantity", () => {
    const cart = { items: [{ quantity: 2 }] } // no variant/product/metadata weight
    const s = computeCartWeight(cart, OVERHEAD, DEFAULT)
    expect(s.itemsWeightGrams).toBe(600) // 2 × 300
    expect(s.totalWeightGrams).toBe(750) // + 150 overhead
    expect(s.itemsMissingWeight).toBe(1) // still flagged as missing a REAL weight
    expect(s.defaultItemWeightGrams).toBe(300)
  })

  it("bulk orders price far above a single item (the '$15 for 20 boxes' fix)", () => {
    const single = computeCartWeight({ items: [{ quantity: 1 }] }, OVERHEAD, DEFAULT)
    const bulk = computeCartWeight({ items: [{ quantity: 200 }] }, OVERHEAD, DEFAULT)
    expect(bulk.totalWeightGrams).toBeGreaterThan(single.totalWeightGrams * 50)
  })

  it("prefers a real variant weight over the default", () => {
    const cart = { items: [{ quantity: 2, variant: { weight: 500 } }] }
    const s = computeCartWeight(cart, OVERHEAD, DEFAULT)
    expect(s.itemsWeightGrams).toBe(1000) // 2 × 500 (real), not the default
    expect(s.itemsMissingWeight).toBe(0)
  })

  it("honours metadata.weight_grams (e.g. DTF gangsheets) over the default", () => {
    const cart = {
      items: [{ quantity: 1, metadata: { weight_grams: 1200 } }],
    }
    const s = computeCartWeight(cart, OVERHEAD, DEFAULT)
    expect(s.itemsWeightGrams).toBe(1200)
    expect(s.itemsMissingWeight).toBe(0)
  })

  it("opts out of the fallback when default is 0 (raw real-weight behaviour)", () => {
    const cart = { items: [{ quantity: 5 }] }
    const s = computeCartWeight(cart, OVERHEAD, 0)
    expect(s.itemsWeightGrams).toBe(0)
    expect(s.totalWeightGrams).toBe(150) // overhead only
    expect(s.defaultItemWeightGrams).toBe(0)
  })

  it("mixes real-weight and weightless lines correctly", () => {
    const cart = {
      items: [
        { quantity: 1, variant: { weight: 800 } }, // real
        { quantity: 3 }, // default × 3
      ],
    }
    const s = computeCartWeight(cart, OVERHEAD, DEFAULT)
    expect(s.itemsWeightGrams).toBe(800 + 900)
    expect(s.itemsMissingWeight).toBe(1)
  })
})
