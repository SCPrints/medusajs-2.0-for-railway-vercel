import { GARMENT_WEIGHT_GRAMS_BY_TYPE, pickGarmentWeightGrams } from "../garment-weights"

describe("pickGarmentWeightGrams", () => {
  it("maps known types to grams", () => {
    expect(pickGarmentWeightGrams("T-Shirts")).toBe(200)
    expect(pickGarmentWeightGrams("Hoodies")).toBe(550)
    expect(pickGarmentWeightGrams("Puffer Jackets")).toBe(700)
    expect(pickGarmentWeightGrams("Socks")).toBe(60)
  })

  it("is case- and whitespace-insensitive", () => {
    expect(pickGarmentWeightGrams("  hoodies ")).toBe(550)
    expect(pickGarmentWeightGrams("POLOS")).toBe(250)
  })

  it("returns null for unknown or blank types", () => {
    expect(pickGarmentWeightGrams("Cardigans")).toBeNull()
    expect(pickGarmentWeightGrams("")).toBeNull()
    expect(pickGarmentWeightGrams(null)).toBeNull()
    expect(pickGarmentWeightGrams(undefined)).toBeNull()
  })

  it("every table entry is a positive integer", () => {
    for (const [type, grams] of Object.entries(GARMENT_WEIGHT_GRAMS_BY_TYPE)) {
      expect(Number.isInteger(grams) && grams > 0).toBe(true)
      expect(pickGarmentWeightGrams(type)).toBe(grams)
    }
  })
})
