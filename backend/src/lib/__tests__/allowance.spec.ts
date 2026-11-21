import { allowanceClosed, cleanAllowanceItems, matchSize, picksToRangeItems, validatePicks } from "../allowance"

const items = [{ design_id: "d1", per_person: 2 }]
const sizes = { d1: ["S", "M", "L"] }

describe("allowance", () => {
  it("cleans items", () => {
    expect(cleanAllowanceItems([{ design_id: "d1", per_person: 1 }, { design_id: "d1", per_person: 1 }, { design_id: "", per_person: 3 }])).toEqual(items)
  })
  it("closed by status, cart or date", () => {
    expect(allowanceClosed({ status: "open" })).toBe(false)
    expect(allowanceClosed({ status: "closed" })).toBe(true)
    expect(allowanceClosed({ cart_id: "cart_1" })).toBe(true)
    expect(allowanceClosed({ closes_at: "2020-01-01T00:00:00Z" })).toBe(true)
    expect(allowanceClosed({ closes_at: "2099-01-01T00:00:00Z" })).toBe(false)
  })
  it("matches sizes ignoring case", () => {
    expect(matchSize("m", sizes.d1)).toBe("M")
    expect(matchSize("XL", sizes.d1)).toBeNull()
  })
  it("validates picks", () => {
    expect(validatePicks(items, [{ design_id: "d1", size: "M", quantity: 2 }], sizes).ok).toBe(true)
    expect(validatePicks(items, [{ design_id: "d1", size: "M", quantity: 1 }, { design_id: "d1", size: "L", quantity: 2 }], sizes).ok).toBe(false)
    expect(validatePicks(items, [{ design_id: "d1", size: "XL", quantity: 1 }], sizes).ok).toBe(false)
    expect(validatePicks(items, [{ design_id: "d2", size: "M", quantity: 1 }], sizes).ok).toBe(false)
    const merged = validatePicks(items, [{ design_id: "d1", size: "M", quantity: 1 }, { design_id: "d1", size: "M", quantity: 1 }], sizes)
    expect(merged.ok && merged.picks).toEqual([{ design_id: "d1", size: "M", quantity: 2 }])
  })
  it("totals picks into range items and reports unmatched", () => {
    const res = picksToRangeItems(
      [
        { name: "A", picks: [{ design_id: "d1", size: "M", quantity: 1 }] },
        { name: "B", picks: [{ design_id: "d1", size: "M", quantity: 2 }, { design_id: "d1", size: "XL", quantity: 1 }] },
      ],
      (d, s) => (s === "M" ? `v_${d}_M` : null)
    )
    expect(res.items).toEqual([{ design_id: "d1", variant_id: "v_d1_M", quantity: 3 }])
    expect(res.unmatched).toEqual(["B"])
  })
})
