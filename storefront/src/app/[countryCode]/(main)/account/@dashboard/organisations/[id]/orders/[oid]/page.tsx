import { Metadata } from "next"
import { notFound } from "next/navigation"
import type { HttpTypes } from "@medusajs/types"

import {
  getOrganisationDetail,
  getOrganisationOrderDetail,
} from "@lib/data/organisations"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductionStageTracker from "@modules/order/components/production-stage-tracker"

import CancelOrderButton from "@modules/account/components/organisations/cancel-order-button"

export const metadata: Metadata = {
  title: "Order",
  description: "Fulfillment order detail.",
}

const STAGE_LABELS: Record<string, string> = {
  received: "Received",
  art_review: "In artwork",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  blanks_ordered: "Blanks ordered",
  blanks_arrived: "Blanks arrived",
  in_production: "In production",
  quality_check: "Quality check",
  shipped: "Shipped",
  delivered: "Delivered",
}

function formatCurrency(amount: number | null | undefined, currency = "AUD") {
  if (amount == null) return "—"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

type PageProps = {
  params: Promise<{ id: string; oid: string; countryCode: string }>
}

export default async function OrgOrderDetailPage({ params }: PageProps) {
  const { id, oid } = await params

  const [detail, orderDetail] = await Promise.all([
    getOrganisationDetail(id),
    getOrganisationOrderDetail(id, oid),
  ])

  if (!detail || !orderDetail) {
    notFound()
  }

  const { organisation, role } = detail
  const { order, destination, placed_by: placedBy } = orderDetail

  const items = (order.items ?? []) as any[]
  const stage = (order.metadata?.production_stage ?? "received") as string
  const isCancelled = Boolean(order.canceled_at)
  const placedByName = placedBy
    ? [placedBy.first_name, placedBy.last_name]
        .filter(Boolean)
        .join(" ") || placedBy.email
    : null

  return (
    <div className="w-full">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ui-fg-muted">
        <LocalizedClientLink
          href="/account/organisations"
          className="hover:text-ui-fg-base"
        >
          My organisations
        </LocalizedClientLink>
        <span aria-hidden>·</span>
        <LocalizedClientLink
          href={`/account/organisations/${id}#orders`}
          className="hover:text-ui-fg-base"
        >
          {organisation.name}
        </LocalizedClientLink>
        <span aria-hidden>·</span>
        <span className="text-ui-fg-subtle">Order #{order.display_id}</span>
      </nav>

      <header className="mb-6 border-l-4 border-[var(--brand-secondary)] pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Order
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ui-fg-base small:text-3xl">
            Order #{order.display_id}
          </h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isCancelled
                ? "bg-rose-50 text-rose-700"
                : "bg-ui-bg-subtle text-ui-fg-base"
            }`}
          >
            {isCancelled ? "Cancelled" : STAGE_LABELS[stage] ?? stage}
          </span>
        </div>
      </header>

      {/* Production stage tracker — reuses existing storefront component */}
      {!isCancelled ? (
        <section className="mb-6">
          <ProductionStageTracker
            order={order as unknown as HttpTypes.StoreOrder}
          />
        </section>
      ) : null}

      {/* Shipping context */}
      <section className="mb-6 rounded-2xl border border-ui-border-base bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Shipping to
        </h2>
        {destination ? (
          <>
            <p className="mt-2 text-sm font-semibold text-ui-fg-base">
              {destination.name}
            </p>
            <p className="mt-1 text-sm text-ui-fg-subtle">
              {destination.address_1}
              {destination.address_2 ? `, ${destination.address_2}` : ""}
            </p>
            <p className="text-sm text-ui-fg-subtle">
              {destination.city}
              {destination.province ? `, ${destination.province}` : ""}{" "}
              {destination.postal_code}
            </p>
            {destination.delivery_notes ? (
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ui-bg-subtle px-3 py-2 text-xs text-ui-fg-base">
                {destination.delivery_notes}
              </p>
            ) : null}
          </>
        ) : order.shipping_address ? (
          <>
            <p className="mt-2 text-sm text-ui-fg-subtle">
              {order.shipping_address.address_1}
              {order.shipping_address.address_2
                ? `, ${order.shipping_address.address_2}`
                : ""}
            </p>
            <p className="text-sm text-ui-fg-subtle">
              {order.shipping_address.city}
              {order.shipping_address.province
                ? `, ${order.shipping_address.province}`
                : ""}{" "}
              {order.shipping_address.postal_code}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ui-fg-muted">
            No shipping address on file.
          </p>
        )}
      </section>

      {/* Items */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Items
        </h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-ui-border-base bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ui-border-base bg-ui-bg-subtle text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Item</th>
                <th className="px-3 py-3 text-right font-semibold">Qty</th>
                <th className="px-3 py-3 text-right font-semibold">Unit</th>
                <th className="px-3 py-3 text-right font-semibold">Line</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-3 align-middle text-ui-fg-base">
                    {it.title || it.product_title}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {it.quantity}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(it.unit_price, order.currency_code)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(
                      Number(it.unit_price) * Number(it.quantity),
                      order.currency_code
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ui-border-base bg-ui-bg-subtle text-sm font-semibold">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right">
                  Total
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatCurrency(order.total, order.currency_code)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Meta footer */}
      <section className="mb-6 rounded-2xl border border-ui-border-base bg-white p-5 text-sm text-ui-fg-subtle">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {order.metadata?.external_ref ? (
            <p>
              <span className="text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
                Your ref:{" "}
              </span>
              <span className="text-ui-fg-base">
                {String(order.metadata.external_ref)}
              </span>
            </p>
          ) : null}
          {placedByName ? (
            <p>
              <span className="text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
                Placed by:{" "}
              </span>
              <span className="text-ui-fg-base">{placedByName}</span>
            </p>
          ) : null}
          <p>
            <span className="text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
              Placed:{" "}
            </span>
            <span className="text-ui-fg-base">
              {new Date(order.created_at).toLocaleString("en-AU")}
            </span>
          </p>
          {order.metadata?.requested_ship_by ? (
            <p>
              <span className="text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
                Needed by:{" "}
              </span>
              <span className="text-ui-fg-base">
                {String(order.metadata.requested_ship_by)}
              </span>
            </p>
          ) : null}
        </div>
        {order.metadata?.notes ? (
          <div className="mt-3">
            <p className="text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-ui-fg-base">
              {String(order.metadata.notes)}
            </p>
          </div>
        ) : null}
      </section>

      {/* Cancel */}
      <section className="rounded-2xl border border-ui-border-base bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Need to change this order?
        </h2>
        <div className="mt-3">
          <CancelOrderButton
            orgId={id}
            orderId={order.id}
            createdAt={order.created_at}
            role={role}
            isCancelled={isCancelled}
          />
        </div>
      </section>
    </div>
  )
}
