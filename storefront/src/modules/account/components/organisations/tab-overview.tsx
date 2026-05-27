import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type {
  InventoryRow,
  OrganisationDesign,
  OrganisationDestination,
  OrgOrderSummary,
  OrgRole,
} from "@lib/data/organisations"

type Props = {
  orgId: string
  designs: OrganisationDesign[]
  destinations: OrganisationDestination[]
  inventory: InventoryRow[]
  recentOrders: OrgOrderSummary[]
  role: OrgRole
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

export default function OverviewTab({
  orgId,
  designs,
  destinations,
  inventory,
  recentOrders,
  role,
}: Props) {
  const skuCount = inventory.length
  const designCount = designs.filter((d) => d.is_active).length
  const destCount = destinations.filter((d) => d.is_active).length
  const canPlace = role === "owner" || role === "purchaser"

  return (
    <div className="flex flex-col gap-8">
      {/* Quick stats */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Quick stats
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 phone:grid-cols-3">
          <div className="rounded-2xl border border-ui-border-base bg-white p-5">
            <p className="text-3xl font-semibold text-ui-fg-base">
              {designCount}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.1em] text-ui-fg-muted">
              {designCount === 1 ? "Design" : "Designs"}
            </p>
          </div>
          <div className="rounded-2xl border border-ui-border-base bg-white p-5">
            <p className="text-3xl font-semibold text-ui-fg-base">{destCount}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.1em] text-ui-fg-muted">
              {destCount === 1 ? "Destination" : "Destinations"}
            </p>
          </div>
          <div className="rounded-2xl border border-ui-border-base bg-white p-5">
            <p className="text-3xl font-semibold text-ui-fg-base">{skuCount}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.1em] text-ui-fg-muted">
              SKUs
            </p>
          </div>
        </div>
      </section>

      {/* Recent orders */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
            Recent orders
          </h2>
          {recentOrders.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.hash = "orders"
                }
              }}
              className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline"
            >
              View all →
            </button>
          ) : null}
        </div>

        {recentOrders.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-ui-border-base bg-white p-6 text-center">
            <p className="text-sm text-ui-fg-subtle">
              No orders yet. Place your first one to see it here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-ui-border-base rounded-2xl border border-ui-border-base bg-white">
            {recentOrders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <LocalizedClientLink
                  href={`/account/organisations/${orgId}/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-ui-bg-subtle"
                >
                  <div className="flex flex-col">
                    <p className="text-sm font-semibold text-ui-fg-base">
                      #{o.display_id}
                    </p>
                    <p className="text-xs text-ui-fg-muted">
                      {new Date(o.created_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                      {" · "}
                      {o.quantity_total} unit{o.quantity_total === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-ui-bg-subtle px-3 py-1 text-xs font-semibold text-ui-fg-base">
                      {o.production_stage
                        ? STAGE_LABELS[o.production_stage] ?? o.production_stage
                        : "Received"}
                    </span>
                    <span className="hidden text-xs text-ui-fg-muted phone:inline">
                      {formatCurrency(o.total, o.currency_code)}
                    </span>
                    <span aria-hidden className="text-ui-fg-muted">
                      →
                    </span>
                  </div>
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Need to restock? CTA */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Need to restock?
        </h2>
        <div className="mt-3 rounded-2xl border border-ui-border-base bg-white p-5">
          {canPlace ? (
            <LocalizedClientLink
              href={`/account/organisations/${orgId}/orders/new`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-secondary)]/90 min-h-11"
            >
              <span aria-hidden>+</span>
              Place new order
            </LocalizedClientLink>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-ui-bg-subtle px-5 py-2.5 text-sm font-semibold text-ui-fg-muted min-h-11"
                aria-disabled="true"
                title="Viewer role can't place orders"
              >
                <span aria-hidden>+</span>
                Place new order
              </button>
              <p className="text-xs text-ui-fg-muted">
                Your role is read-only. Ask an owner to invite you as a
                purchaser.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
