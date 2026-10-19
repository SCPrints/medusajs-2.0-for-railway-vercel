import { Metadata } from "next"
import OrderOverview from "@modules/account/components/order-overview"
import { listOrders } from "@lib/data/orders"
import { SeasonalMarginMascot } from "@modules/themes/components/seasonal-decorations"

export const metadata: Metadata = {
  title: "Orders",
  description: "Overview of your previous orders.",
}

export default async function Orders(){const orders = (await listOrders()) ?? []

  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <header className="relative mb-8 border-l-4 border-brand pl-4">
        {/* Seasonal: the stamp ghost approves proofs (Halloween only). */}
        <SeasonalMarginMascot name="stamp-ghost" size={110} className="right-0 -top-2" />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Order history
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl">
          Orders
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          View your previous orders and their status &mdash; track production,
          re-order, or request a return.
        </p>
      </header>
      <OrderOverview orders={orders} />
    </div>
  )
}
