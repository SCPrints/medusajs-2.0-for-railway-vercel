import { addBusinessDays, deliveryWindow, formatDeliveryWindow } from "./delivery-window"

describe("deliveryWindow", () => {
  it("skips weekends", () => {
    // Fri 28 Nov 2025 + 1 business day = Mon 1 Dec
    expect(addBusinessDays(new Date(2025, 10, 28), 1).getDate()).toBe(1)
  })
  it("adds production + transit", () => {
    const w = deliveryWindow(new Date(2025, 10, 24), { low_days: 4, high_days: 7 }) // Mon
    expect(formatDeliveryWindow(w)).toMatch(/Wed,? 3 Dec.*Thu,? 11 Dec/)
  })
})
