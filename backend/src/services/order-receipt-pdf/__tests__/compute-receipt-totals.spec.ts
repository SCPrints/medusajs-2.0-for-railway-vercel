import { computeReceiptTotals } from "../service"

// retrieveOrder-shaped input: item unit_price/quantity + shipping_methods.amount
// + summary.raw_current_order_total are the fields it reliably decorates.

describe("computeReceiptTotals", () => {
  it("treats a pre-GST order's total as GST-inclusive (order #41)", () => {
    const out = computeReceiptTotals({
      id: "o41",
      items: [{ id: "li", title: "Relax Hood", unit_price: 71.38, quantity: 10 }],
      shipping_methods: [{ name: "Standard Shipping (AU)", amount: 20 }],
      summary: { raw_current_order_total: { value: 733.8 } },
    })
    // no GST was added on top → total is GST-inclusive, GST = total / 11
    expect(out.gst_included).toBe(true)
    expect(out.item_subtotal).toBeCloseTo(713.8, 2)
    expect(out.shipping_subtotal).toBeCloseTo(20, 2)
    expect(out.tax_total).toBeCloseTo(66.71, 2)
    expect(out.total).toBeCloseTo(733.8, 2)
    // items + shipping already sum to total (GST embedded, not added)
    expect(Number(out.item_subtotal) + Number(out.shipping_subtotal)).toBeCloseTo(
      Number(out.total),
      2
    )
  })

  it("shows GST added-on-top for a post-24-Jun order (probe: $168.30 order)", () => {
    // Real retrieveOrder shape (probed order #43): top-level total undecorated,
    // total lives in summary.raw_*_order_total, current === original when unrefunded.
    const out = computeReceiptTotals({
      id: "oGST",
      items: [{ id: "a", unit_price: 142, quantity: 1 }],
      shipping_methods: [{ amount: 11 }],
      summary: {
        raw_current_order_total: { value: 168.3 },
        raw_original_order_total: { value: 168.3 },
      },
    })
    expect(out.gst_included).toBe(false)
    expect(out.item_subtotal).toBeCloseTo(142, 2)
    expect(out.shipping_subtotal).toBeCloseTo(11, 2)
    expect(out.tax_total).toBeCloseTo(15.3, 2) // 10% of (142 + 11)
    expect(out.total).toBeCloseTo(168.3, 2)
    // ex-GST lines + GST = total
    expect(
      Number(out.item_subtotal) + Number(out.shipping_subtotal) + Number(out.tax_total)
    ).toBeCloseTo(Number(out.total), 2)
  })

  it("invoices the SALE total via paid_total for a fully-refunded order (#43)", () => {
    // Real probed shape of prod #43: original_order_total AND current_order_total
    // BOTH collapse to 0 on a full refund; paid_total (gross captured) still
    // carries the placed $168.30. The invoice must show that, not the ex-GST $153.
    const out = computeReceiptTotals({
      id: "oRefunded",
      items: [{ id: "a", unit_price: 71, quantity: 2 }],
      shipping_methods: [{ amount: 11 }],
      summary: {
        raw_original_order_total: { value: 0 },
        original_order_total: 0,
        raw_current_order_total: { value: 0 },
        current_order_total: 0,
        raw_paid_total: { value: 168.3 },
        paid_total: 168.3,
        refunded_total: 168.3,
      },
    })
    expect(out.total).toBeCloseTo(168.3, 2)
    expect(out.tax_total).toBeCloseTo(15.3, 2)
    expect(out.gst_included).toBe(false)
  })

  it("keeps a tax-exempt order at $0 GST", () => {
    const out = computeReceiptTotals({
      id: "oExempt",
      metadata: { tax_exempt: true },
      items: [{ id: "a", unit_price: 100, quantity: 2 }],
      shipping_methods: [{ amount: 10 }],
      summary: { raw_current_order_total: { value: 210 } },
    })
    expect(out.gst_included).toBe(false)
    expect(out.tax_total).toBeCloseTo(0, 2)
  })
})
