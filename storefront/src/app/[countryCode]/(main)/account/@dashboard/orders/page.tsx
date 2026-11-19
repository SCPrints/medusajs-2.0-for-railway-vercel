import { Metadata } from "next"
import OrderOverview from "@modules/account/components/order-overview"
import { listOrdersPage } from "@lib/data/orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SeasonalMarginMascot } from "@modules/themes/components/seasonal-decorations"

export const metadata: Metadata = {
  title: "Orders",
  description: "Overview of your previous orders.",
}

const PAGE_SIZE = 10

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const page = Math.min(50, Math.max(1, Number((await searchParams).page) || 1))
  // ponytail: "Show more" re-fetches pages 1..N in one call (simple, linkable,
  // back button works). Switch to a client "load more" if histories get long.
  const { orders, hasMore } = await listOrdersPage(PAGE_SIZE * page, 0)

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
          View your previous orders and their status &mdash; track production
          or order the same again in one click.
        </p>
      </header>
      <OrderOverview orders={orders} />
      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <LocalizedClientLink
            href={`/account/orders?page=${page + 1}`}
            scroll={false}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-ui-border-base bg-white px-6 py-2.5 text-sm font-semibold text-ui-fg-base hover:bg-ui-bg-subtle"
            data-testid="orders-show-more"
          >
            Show more orders
          </LocalizedClientLink>
        </div>
      ) : null}
    </div>
  )
}
