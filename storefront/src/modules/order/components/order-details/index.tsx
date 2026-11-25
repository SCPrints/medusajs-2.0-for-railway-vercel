import { HttpTypes } from "@medusajs/types"

import { isCancelledOrder } from "@modules/order/lib/cancelled"

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
    <span className="text-sm text-ink font-medium">
      {children}
    </span>
  </div>
)

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const poNumber = meta.po_number
  // Placed on account for an organisation: no card was charged, an invoice is due.
  const terms = meta.account_terms as { due_at?: string } | undefined
  const paymentStatus = String((order as any).payment_status ?? "not_paid")
  const unpaid = paymentStatus !== "captured"
  const dueAt = terms?.due_at ? new Date(terms.due_at) : null
  const cancelled = isCancelledOrder(order)
  return (
    <div className="bg-ui-bg-subtle rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Row label="Order date">
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" })}
        </span>
      </Row>
      <Row label="Order number">
        <span
          data-testid="order-id"
          className="text-brand"
        >
          #{order.display_id}
        </span>
      </Row>
      <Row label="Confirmation sent to">
        <span data-testid="order-email" className="break-all">
          {order.email}
        </span>
      </Row>

      {typeof poNumber === "string" && poNumber ? (
        <Row label="PO number">
          <span data-testid="order-po-number" className="break-all">
            {poNumber}
          </span>
        </Row>
      ) : null}

      {terms && unpaid && dueAt && !cancelled ? (
        <Row label="Payment due">
          <span data-testid="order-payment-due">
            {dueAt.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" })}
          </span>
        </Row>
      ) : null}
      {typeof meta.cost_centre === "string" && meta.cost_centre ? (
        <Row label="Cost centre">{meta.cost_centre}</Row>
      ) : null}

      {showStatus && (
        <>
          {/* ponytail: fulfilment status is only created when the production
              stage reaches "shipped", so "Not fulfilled" next to an "In
              production" tracker reads as a contradiction. The tracker owns
              progress; hide this row whenever a stage exists. A cancelled order
              has no tracker, so it always says so here. */}
          {cancelled ? (
            <Row label="Order status">
              <span data-testid="order-status">Cancelled</span>
            </Row>
          ) : !order.metadata?.production_stage && (
            <Row label="Order status">
              <span data-testid="order-status">
                {formatStatus((order as any).fulfillment_status ?? "not_fulfilled")}
              </span>
            </Row>
          )}
          <Row label="Payment status">
            <span data-testid="order-payment-status">
              {/* Cancelling refunds anything captured ("Refunded"); otherwise nothing is owed. */}
              {cancelled && !paymentStatus.includes("refunded")
                ? "Nothing to pay"
                : terms && unpaid
                  ? "On account"
                  : formatStatus(paymentStatus)}
            </span>
          </Row>
        </>
      )}

      {/* Account view only (signed in): one zip with the tax invoice, proofs and artwork. */}
      {showStatus && (
        <div className="col-span-full">
          <a
            href={`/api/orders/${encodeURIComponent(order.id)}/download-pack`}
            download
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ui-border-base bg-white px-5 py-2.5 text-sm font-semibold text-ink! hover:bg-ui-bg-subtle"
            data-testid="order-download-pack"
          >
            Download everything (.zip)
          </a>
          <p className="mt-1 text-xs text-ui-fg-subtle">Tax invoice, proofs and your artwork in one file.</p>
        </div>
      )}
    </div>
  )
}

export default OrderDetails
