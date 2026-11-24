import { paymentLinkAmount } from "../payment-link-amount"

describe("paymentLinkAmount", () => {
  it("asks for the deposit while it's unpaid", () => {
    expect(paymentLinkAmount({ outstanding: 800, deposit_required_cents: 40000, deposit_paid: false }, 131)).toEqual({ amount_cents: 40000, scenario: "deposit", label: "Deposit — Order #131" })
  })
  it("asks for the balance once the deposit is in", () => {
    expect(paymentLinkAmount({ outstanding: 400, deposit_required_cents: 40000, deposit_paid: true }, 131)).toEqual({ amount_cents: 40000, scenario: "balance", label: "Balance — Order #131" })
  })
  it("asks for everything owing when no deposit was set", () => {
    expect(paymentLinkAmount({ outstanding: 123.45 }, 7)).toEqual({ amount_cents: 12345, scenario: "full", label: "Order #7" })
  })
  it("never asks for more than is owing, or for nothing", () => {
    expect(paymentLinkAmount({ outstanding: 100, deposit_required_cents: 40000, deposit_paid: false }, 1)?.amount_cents).toBe(10000)
    expect(paymentLinkAmount({ outstanding: 0 }, 1)).toBeNull()
  })
})
