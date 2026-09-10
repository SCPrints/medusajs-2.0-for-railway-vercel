import {
  calculateUvdtfSheetPrice,
  UVDTF_SHEET_SETUP_FEE,
  uvdtfSheetRate,
} from "./uvdtf-sheet"
import { calculateUvdtfAppliedPrice, UVDTF_APPLICATION_PER_METRE } from "./uvdtf-applied"

describe("calculateUvdtfSheetPrice", () => {
  it("rounds metres down to whole metres", () => {
    const r = calculateUvdtfSheetPrice({ metres: 2.7 })
    expect(r.quantity).toBe(2)
    expect(r.decorationSubtotal).toBe(2 * 58)
  })

  it("steps the per-metre rate down at 2 / 5 / 10 / 25 m", () => {
    expect(uvdtfSheetRate(1)).toBe(65)
    expect(uvdtfSheetRate(2)).toBe(58)
    expect(uvdtfSheetRate(4)).toBe(58)
    expect(uvdtfSheetRate(5)).toBe(52)
    expect(uvdtfSheetRate(10)).toBe(48)
    expect(uvdtfSheetRate(25)).toBe(45)
    expect(uvdtfSheetRate(100)).toBe(45)
  })

  it("includes setup fee unless reorder", () => {
    const fresh = calculateUvdtfSheetPrice({ metres: 1 })
    const repeat = calculateUvdtfSheetPrice({ metres: 1, reorder: true })
    expect(fresh.setupTotal).toBe(UVDTF_SHEET_SETUP_FEE)
    expect(repeat.setupTotal).toBe(0)
  })

  it("extracts embedded GST from the inc-GST rate-card sum (HOLD cutover)", () => {
    const r = calculateUvdtfSheetPrice({ metres: 1 })
    // $65/metre + $25 setup = $90 INC-GST → $8.18 embedded GST, $81.82 ex.
    expect(r.totalIncGst).toBe(90)
    expect(r.gst).toBe(8.18)
    expect(r.subtotalExGst).toBe(81.82)
  })

  it("applied = sheet band rate + application add-on", () => {
    const r = calculateUvdtfAppliedPrice({ metres: 5, reorder: true })
    expect(r.unitPrice).toBe(52 + UVDTF_APPLICATION_PER_METRE)
    expect(r.totalIncGst).toBe(5 * (52 + UVDTF_APPLICATION_PER_METRE))
  })
})
