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

  it("extracts embedded GST from the inc-GST rate-card sum (HOLD cutover)", () => {
    const r = calculateUvdtfSheetPrice({ metres: 1 })
    // $25/metre + $25 setup = $50 INC-GST → $4.55 embedded GST, $45.45 ex.
    expect(r.totalIncGst).toBe(50)
    expect(r.gst).toBe(4.55)
    expect(r.subtotalExGst).toBe(45.45)
  })
})
