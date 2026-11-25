"use client"

import React from "react"

import Help from "@modules/order/components/help"
import InvoiceDownloadButton from "@modules/order/components/invoice-download-button"
import Items from "@modules/order/components/items"
import OrderDetails from "@modules/order/components/order-details"
import OrderSummary from "@modules/order/components/order-summary"
import OrderWatchers from "@modules/order/components/order-watchers"
import ProductionPhotos from "@modules/order/components/production-photos"
import ProductionStageTracker from "@modules/order/components/production-stage-tracker"
import ReorderActions from "@modules/order/components/reorder-actions"
import ShippingDetails from "@modules/order/components/shipping-details"
import TrackingList from "@modules/order/components/tracking-list"
import { cancelledOnLabel, isCancelledOrder } from "@modules/order/lib/cancelled"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

type OrderDetailsTemplateProps = {
  order: HttpTypes.StoreOrder
}

const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M13 8H3M7 4L3 8l4 4" />
  </svg>
)

const OrderDetailsTemplate: React.FC<OrderDetailsTemplateProps> = ({
  order,
}) => {
  // Cancelled: no progress, tracking or update emails to show, and nothing to pay.
  const cancelled = isCancelledOrder(order)
  const cancelledOn = cancelledOnLabel((order as { canceled_at?: unknown }).canceled_at)
  return (
    <div className="flex flex-col justify-center gap-y-6">
      <LocalizedClientLink
        href="/account/orders"
        className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-brand"
        data-testid="back-to-overview-button"
      >
        <ArrowLeftIcon className="transition-transform group-hover:-translate-x-0.5" />
        Back to orders
      </LocalizedClientLink>

      <div className="flex flex-wrap items-end justify-between gap-3 border-l-4 border-brand pl-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">
            Order #{order.display_id}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl small:leading-8">
            Order details
          </h1>
        </div>
        <InvoiceDownloadButton orderId={order.id} />
      </div>

      <div
        className="flex flex-col gap-4 h-full w-full"
        data-testid="order-details-container"
      >
        {cancelled ? (
          <div
            className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4"
            data-testid="order-cancelled-note"
          >
            <p className="text-sm font-semibold text-rose-900">
              This order was cancelled{cancelledOn ? ` on ${cancelledOn}` : ""}.
            </p>
            <p className="mt-1 text-sm text-rose-800">
              Nothing more will be made or sent, and there&apos;s nothing more to pay.
            </p>
          </div>
        ) : null}
        <OrderDetails order={order} showStatus />
        {cancelled ? null : <ProductionStageTracker order={order} />}
        <ProductionPhotos order={order} />
        {!cancelled && typeof order.metadata?.team_store_closes_at === "string" ? (
          <p className="rounded-md bg-ui-bg-subtle p-3 text-sm" data-testid="team-store-note">
            Team store order{typeof order.metadata?.team_store_title === "string" ? ` (${order.metadata.team_store_title})` : ""}: it prints when the store closes on{" "}
            {new Date(order.metadata.team_store_closes_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" })}.
          </p>
        ) : null}
        <ReorderActions order={order} />
        {cancelled ? null : <OrderWatchers orderId={order.id} />}
        <Items items={order.items} />
        <ShippingDetails order={order} />
        {cancelled ? null : <TrackingList order={order} />}
        <OrderSummary order={order} />
        <Help />
      </div>
    </div>
  )
}

export default OrderDetailsTemplate
