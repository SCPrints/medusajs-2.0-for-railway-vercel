import { calculateUvdtfSheetPrice, UVDTF_SHEET_SETUP_FEE } from "./uvdtf-sheet"

describe("calculateUvdtfSheetPrice", () => {
  it("rounds metres down to whole metres", () => {
    const r = calculateUvdtfSheetPrice({ metres: 2.7 })
    expect(r.quantity).toBe(2)
    expect(r.decorationSubtotal).toBe(50)
  })

  it("includes setup fee unless reorder", () => {
    const fresh = calculateUvdtfSheetPrice({ metres: 1 })
    const repeat = calculateUvdtfSheetPrice({ metres: 1, reorder: true })
    expect(fresh.setupTotal).toBe(UVDTF_SHEET_SETUP_FEE)
    expect(repeat.setupTotal).toBe(0)
  })

  it("adds 10% GST to ex-GST subtotal", () => {
    const r = calculateUvdtfSheetPrice({ metres: 1 })
    // 25 metre + 25 setup = 50 ex-GST → $5 GST → $55 inc-GST
    expect(r.subtotalExGst).toBe(50)
    expect(r.gst).toBe(5)
    expect(r.totalIncGst).toBe(55)
  })
})
