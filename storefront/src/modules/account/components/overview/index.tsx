import ChevronDown from "@modules/common/icons/chevron-down"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertMinorToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { TIER_GROUP_NAME_PREFIX, type Tier } from "@lib/customer-tiers"
import type { SavedDesign } from "@lib/data/designs"
import OrderAgainButton from "@modules/order/components/order-again-button"
import { collectParcels } from "@modules/order/lib/parcels"
import { isStudioLine } from "@modules/order/lib/design-groups"
import {
  CUSTOMER_MILESTONES,
  CUSTOMER_MILESTONE_LABEL,
  customerMilestoneForStage,
  milestoneIndex,
  readProductionStageMetadata,
} from "@modules/order/lib/production-stage"

const TradePricingBadge = ({ tier }: { tier: Tier }) => {
  const label = tier.name.slice(TIER_GROUP_NAME_PREFIX.length)
  const discountPct = Math.round((1 - tier.multiplier / 2.2) * 100)
  return (
    <div className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13.5 4.5 6 12l-3.5-3.5" />
        </svg>
        Trade pricing active — {label}
      </span>
      <span className="text-xs text-emerald-700">
        {tier.rank === 1
          ? "Our best pricing is applied to your account on every product."
          : `Your account price is applied to every product${discountPct > 0 ? ` (around ${discountPct}% off retail)` : ""}.`}
      </span>
    </div>
  )
}

const ArrowRightIcon = ({ className }: { className?: string }) => (
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
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-[0.12em]">
    {children}
  </p>
)

/** Open orders (not delivered / cancelled), newest first, max 5. Renders nothing when there are none. */
const OrdersInProgress = ({ orders }: { orders: HttpTypes.StoreOrder[] }) => {
  const jobs = orders
    .map((order) => {
      const { stage } = readProductionStageMetadata(
        (order.metadata ?? null) as Record<string, unknown> | null
      )
      if (!stage || (order as { status?: string }).status === "canceled") return null
      const milestone = customerMilestoneForStage(stage)
      return milestone === "delivered" ? null : { order, milestone }
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)
    .slice(0, 5)
  if (!jobs.length) return null

  return (
    <section className="mb-8 px-5 small:px-0" data-testid="orders-in-progress">
      <h2 className="mb-4 text-xl font-semibold text-ui-fg-base">Orders in progress</h2>
      <ul className="m-0 flex list-none flex-col gap-3 rounded-2xl border border-ui-border-base bg-white p-5">
        {jobs.map(({ order, milestone }) => {
          const idx = milestoneIndex(milestone)
          const parcel = collectParcels(order).find((p) => p.tracking_number)
          return (
            <li key={order.id}>
              <LocalizedClientLink
                href={`/account/orders/details/${order.id}`}
                className="group block rounded-lg p-2 -m-2 hover:bg-ui-bg-subtle"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-ui-fg-base">#{order.display_id}</span>
                  <span className="text-ui-fg-subtle">{CUSTOMER_MILESTONE_LABEL[milestone]}</span>
                </div>
                <div className="mt-2 flex gap-1" aria-hidden>
                  {CUSTOMER_MILESTONES.map((m, i) => (
                    <span
                      key={m}
                      className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-brand" : "bg-ui-bg-subtle"}`}
                    />
                  ))}
                </div>
              </LocalizedClientLink>
              {parcel ? (
                <p className="mt-2 text-xs text-ui-fg-subtle">
                  Tracking: {parcel.tracking_number}
                  {parcel.tracking_url ? (
                    <>
                      {" · "}
                      <a
                        href={parcel.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:text-brand"
                      >
                        Track parcel
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Active jobs, recent designs and one-click re-order. Renders nothing for brand-new customers. */
const PickUpWhereYouLeftOff = ({
  orders,
  designs,
}: {
  orders: HttpTypes.StoreOrder[]
  designs: SavedDesign[]
}) => {
  const lastStudioOrder = orders.find((o) => (o.items ?? []).some(isStudioLine))

  if (!designs.length && !lastStudioOrder) return null

  return (
    <section className="mt-8 px-5 small:px-0" data-testid="pick-up-section">
      <h2 className="mb-4 text-xl font-semibold text-ui-fg-base">Pick up where you left off</h2>
      <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
        {lastStudioOrder ? (
          <div className="rounded-2xl border border-ui-border-base bg-white p-5">
            <SectionLabel>Same again?</SectionLabel>
            <p className="mt-2 text-sm text-ui-fg-subtle">
              Re-order #{lastStudioOrder.display_id} from{" "}
              {new Date(lastStudioOrder.created_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              at today&apos;s prices.
            </p>
            <OrderAgainButton orderId={lastStudioOrder.id} className="mt-4" />
          </div>
        ) : null}

        {designs.length ? (
          <div className="rounded-2xl border border-ui-border-base bg-white p-5 small:col-span-2">
            <div className="flex items-end justify-between gap-3">
              <SectionLabel>Recent designs</SectionLabel>
              <LocalizedClientLink
                href="/account/designs"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 hover:text-brand"
              >
                All designs
                <ArrowRightIcon />
              </LocalizedClientLink>
            </div>
            <ul className="m-0 mt-2 grid list-none grid-cols-2 gap-3 p-0 tablet:grid-cols-4">
              {designs.slice(0, 4).map((d) => (
                <li key={d.id}>
                  <LocalizedClientLink
                    href={
                      d.base_product_handle
                        ? `/products/${d.base_product_handle}?design=${encodeURIComponent(d.id)}`
                        : `/customizer?design=${encodeURIComponent(d.id)}`
                    }
                    className="group block"
                  >
                    <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-ui-bg-subtle">
                      {d.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.thumbnail_url} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]" />
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-ui-fg-base">{d.name}</span>
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  orders: HttpTypes.StoreOrder[] | null
  tier?: Tier | null
  designs?: SavedDesign[]
}

const Overview = ({ customer, orders, tier = null, designs = [] }: OverviewProps) => {
  const profileCompletion = getProfileCompletion(customer)
  const addressCount = customer?.addresses?.length || 0
  const recentOrders = orders ?? []
  const latestOrder = recentOrders[0]

  return (
    <div data-testid="overview-page-wrapper">
      <OrdersInProgress orders={recentOrders} />
      <div className="small:hidden px-5 pb-6">
        {tier ? (
          <div className="mb-4">
            <TradePricingBadge tier={tier} />
          </div>
        ) : null}
        {latestOrder ? (
          <LocalizedClientLink
            href={`/account/orders/details/${latestOrder.id}`}
            className="block rounded-xl border border-ui-border-base bg-white p-4 shadow-xs"
            data-testid="mobile-latest-order"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
              Latest order
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ui-fg-base">
                  #{latestOrder.display_id}
                </p>
                <p className="mt-0.5 text-xs text-ui-fg-subtle">
                  {new Date(latestOrder.created_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  {convertMinorToLocale({
                    amount: latestOrder.total,
                    currency_code: latestOrder.currency_code,
                  })}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
                View
                <ArrowRightIcon />
              </span>
            </div>
          </LocalizedClientLink>
        ) : (
          <div className="rounded-xl border border-dashed border-ui-border-base bg-white p-5 text-center">
            <p className="text-sm text-ui-fg-subtle">
              No orders yet. Place one and it&apos;ll appear here.
            </p>
            <LocalizedClientLink
              href="/store"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white"
            >
              Browse the store
              <ArrowRightIcon />
            </LocalizedClientLink>
          </div>
        )}
        {profileCompletion < 100 ? (
          <LocalizedClientLink
            href="/account/profile"
            className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          >
            <span className="text-sm text-amber-900">
              Profile {profileCompletion}% complete
            </span>
            <ArrowRightIcon className="text-amber-700" />
          </LocalizedClientLink>
        ) : null}
      </div>
      <div className="hidden small:block">
        <header className="border-l-4 border-brand pl-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">
            Account overview
          </p>
          <h1
            className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl small:leading-8"
            data-testid="welcome-message"
            data-value={customer?.first_name}
          >
            Hello {customer?.first_name}
          </h1>
          <p className="mt-2 text-sm text-ui-fg-subtle">
            Signed in as{" "}
            <span
              className="font-semibold text-ui-fg-base"
              data-testid="customer-email"
              data-value={customer?.email}
            >
              {customer?.email}
            </span>
          </p>
          {tier ? <TradePricingBadge tier={tier} /> : null}
        </header>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-ui-border-base bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">
              Profile
            </p>
            <p
              className="mt-3 text-3xl font-semibold text-ui-fg-base small:text-4xl"
              data-testid="customer-profile-completion"
              data-value={profileCompletion}
            >
              {profileCompletion}
              <span className="text-2xl text-ui-fg-muted">%</span>
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-subtle">
              Completed
            </p>
            {profileCompletion < 100 ? (
              <LocalizedClientLink
                href="/account/profile"
                className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-brand"
              >
                Finish your profile
                <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
              </LocalizedClientLink>
            ) : null}
          </div>

          <div className="rounded-2xl border border-ui-border-base bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">
              Addresses
            </p>
            <p
              className="mt-3 text-3xl font-semibold text-ui-fg-base small:text-4xl"
              data-testid="addresses-count"
              data-value={addressCount}
            >
              {addressCount}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-subtle">
              Saved
            </p>
            <LocalizedClientLink
              href="/account/addresses"
              className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-brand"
            >
              {addressCount > 0 ? "Manage addresses" : "Add an address"}
              <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
            </LocalizedClientLink>
          </div>
        </div>

        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                Recent activity
              </p>
              <h2 className="mt-1 text-xl font-semibold text-ui-fg-base">
                Your latest orders
              </h2>
            </div>
            {recentOrders.length > 0 ? (
              <LocalizedClientLink
                href="/account/orders"
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-brand"
              >
                View all orders
                <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
              </LocalizedClientLink>
            ) : null}
          </div>

          <ul
            className="flex list-none flex-col gap-3 p-0"
            data-testid="orders-wrapper"
          >
            {recentOrders.length > 0 ? (
              recentOrders.slice(0, 5).map((order) => (
                <li
                  key={order.id}
                  data-testid="order-wrapper"
                  data-value={order.id}
                >
                  <LocalizedClientLink
                    href={`/account/orders/details/${order.id}`}
                    className="group block rounded-xl border border-ui-border-base bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="grid flex-1 grid-cols-3 gap-x-4 gap-y-1 text-xs small:text-sm">
                        <span className="font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
                          Date placed
                        </span>
                        <span className="font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
                          Order
                        </span>
                        <span className="font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
                          Total
                        </span>
                        <span
                          className="text-ui-fg-base"
                          data-testid="order-created-date"
                        >
                          {new Date(order.created_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" })}
                        </span>
                        <span
                          className="font-semibold text-ui-fg-base"
                          data-testid="order-id"
                          data-value={order.display_id}
                        >
                          #{order.display_id}
                        </span>
                        <span
                          className="font-semibold text-ui-fg-base"
                          data-testid="order-amount"
                        >
                          {convertMinorToLocale({
                            amount: order.total,
                            currency_code: order.currency_code,
                          })}
                        </span>
                      </div>
                      <button
                        className="flex items-center justify-between text-ui-fg-subtle transition group-hover:text-brand"
                        data-testid="open-order-button"
                        type="button"
                      >
                        <span className="sr-only">
                          Go to order #{order.display_id}
                        </span>
                        <ChevronDown className="-rotate-90" />
                      </button>
                    </div>
                  </LocalizedClientLink>
                </li>
              ))
            ) : (
              <li>
                <div className="rounded-xl border border-dashed border-ui-border-base bg-white p-6 text-center">
                  <p
                    className="text-sm text-ui-fg-subtle"
                    data-testid="no-orders-message"
                  >
                    No orders yet. When you place one, it&apos;ll appear here.
                  </p>
                  <LocalizedClientLink
                    href="/store"
                    className="group mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:brightness-110"
                  >
                    Browse the store
                    <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                  </LocalizedClientLink>
                </div>
              </li>
            )}
          </ul>
        </section>
      </div>
      <PickUpWhereYouLeftOff orders={recentOrders} designs={designs} />
    </div>
  )
}

const getProfileCompletion = (customer: HttpTypes.StoreCustomer | null) => {
  let count = 0

  if (!customer) {
    return 0
  }

  if (customer.email) {
    count++
  }

  if (customer.first_name && customer.last_name) {
    count++
  }

  if (customer.phone) {
    count++
  }

  const billingAddress = customer.addresses?.find(
    (addr) => addr.is_default_billing
  )

  if (billingAddress) {
    count++
  }

  return (count / 4) * 100
}

export default Overview
