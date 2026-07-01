import { computeReceiptTotals } from "../service"

// retrieveOrder-shaped input: item unit_price/quantity + shipping_methods.amount
// + summary.raw_current_order_total are the fields it reliably decorates.

describe("computeReceiptTotals", () => {
  it("reconciles a pre-GST order (order #41 shape)", () => {
    const out = computeReceiptTotals({
      id: "o41",
      items: [{ id: "li", title: "Relax Hood", unit_price: 71.38, quantity: 10 }],
      shipping_methods: [{ name: "Standard Shipping (AU)", amount: 20 }],
      summary: { raw_current_order_total: { value: 733.8 } },
    })
    expect(out.item_subtotal).toBeCloseTo(713.8, 2)
    expect(out.shipping_subtotal).toBeCloseTo(20, 2)
    expect(out.tax_total).toBeCloseTo(0, 2)
    expect(out.total).toBeCloseTo(733.8, 2)
    // line total is ex-GST (unit × qty), not $0
    expect(out.items![0].total).toBeCloseTo(713.8, 2)
    // reconciles
    expect(
      Number(out.item_subtotal) + Number(out.shipping_subtotal) + Number(out.tax_total)
    ).toBeCloseTo(Number(out.total), 2)
  })

  it("derives GST for a tax-exclusive order", () => {
    const out = computeReceiptTotals({
      id: "oGST",
      items: [
        { id: "a", unit_price: 119.54, quantity: 2 },
        { id: "b", unit_price: 119.54, quantity: 2 },
      ],
      shipping_methods: [{ amount: 10 }],
      summary: { raw_current_order_total: { value: 536.98 } },
    })
    expect(out.item_subtotal).toBeCloseTo(478.16, 2)
    expect(out.shipping_subtotal).toBeCloseTo(10, 2)
    expect(out.tax_total).toBeCloseTo(48.82, 2)
    expect(out.total).toBeCloseTo(536.98, 2)
  })

  it("falls back to items + shipping when summary is absent", () => {
    const out = computeReceiptTotals({
      id: "oNoSummary",
      items: [{ id: "a", unit_price: 50, quantity: 3 }],
      shipping_methods: [{ amount: 15 }],
    })
    expect(out.item_subtotal).toBeCloseTo(150, 2)
    expect(out.total).toBeCloseTo(165, 2)
    expect(out.tax_total).toBeCloseTo(0, 2)
  })
})
