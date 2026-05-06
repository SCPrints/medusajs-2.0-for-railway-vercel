import { HttpTypes } from "@medusajs/types"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const formatStatus = (str: string) => {
  const formatted = str.split("_").join(" ")
  return formatted.slice(0, 1).toUpperCase() + formatted.slice(1)
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col">
    <span className="text-xs uppercase tracking-wide text-ui-fg-subtle mb-1">
      {label}
    </span>
    <span className="text-sm text-[var(--brand-primary)] font-medium">
      {children}
    </span>
  </div>
)

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  return (
    <div className="bg-ui-bg-subtle rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Row label="Order date">
        <span data-testid="order-date">
          {new Date(order.created_at).toDateString()}
        </span>
      </Row>
      <Row label="Order number">
        <span
          data-testid="order-id"
          className="text-[var(--brand-secondary)]"
        >
          #{order.display_id}
        </span>
      </Row>
      <Row label="Confirmation sent to">
        <span data-testid="order-email" className="break-all">
          {order.email}
        </span>
      </Row>

      {showStatus && (
        <>
          <Row label="Order status">
            <span data-testid="order-status">
              {formatStatus((order as any).fulfillment_status ?? "not_fulfilled")}
            </span>
          </Row>
          <Row label="Payment status">
            <span data-testid="order-payment-status">
              {formatStatus((order as any).payment_status ?? "not_paid")}
            </span>
          </Row>
        </>
      )}
    </div>
  )
}

export default OrderDetails
