import { renderToString } from "react-dom/server"
import OrderDetails from "./index"

const base = {
  created_at: "2026-09-01T00:00:00.000Z",
  display_id: 78,
  email: "sean@scprints.com.au",
  fulfillment_status: "not_fulfilled",
  payment_status: "captured",
} as any

describe("OrderDetails status rows", () => {
  it("hides fulfilment status once a production stage exists", () => {
    const html = renderToString(
      <OrderDetails order={{ ...base, metadata: { production_stage: "in_production" } }} showStatus />
    )
    expect(html).not.toContain('data-testid="order-status"')
    expect(html).toContain('data-testid="order-payment-status"')
  })

  it("offers the download pack in the account view only", () => {
    const order = { ...base, id: "order_1", metadata: {} }
    expect(renderToString(<OrderDetails order={order} showStatus />)).toContain('href="/api/orders/order_1/download-pack"')
    expect(renderToString(<OrderDetails order={order} />)).not.toContain("download-pack")
  })

  it("keeps fulfilment status for orders with no stage", () => {
    const html = renderToString(<OrderDetails order={{ ...base, metadata: {} }} showStatus />)
    expect(html).toContain("Not fulfilled")
  })
})
