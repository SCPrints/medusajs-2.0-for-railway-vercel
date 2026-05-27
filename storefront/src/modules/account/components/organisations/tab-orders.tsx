"use client"

import { useMemo, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type {
  OrganisationDestination,
  OrgOrderSummary,
} from "@lib/data/organisations"

type Props = {
  orgId: string
  orders: OrgOrderSummary[]
  destinations: OrganisationDestination[]
  count: number
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

export default function OrdersTab({ orgId, orders, destinations }: Props) {
  const [destFilter, setDestFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    if (destFilter === "all") return orders
    return orders.filter((o) => o.destination_id === destFilter)
  }, [orders, destFilter])

  const destById = useMemo(
    () =>
      destinations.reduce<Record<string, OrganisationDestination>>((acc, d) => {
        acc[d.id] = d
        return acc
      }, {}),
    [destinations]
  )

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ui-border-base bg-white p-10 text-center">
        <p className="text-sm text-ui-fg-subtle">
          No orders yet. When you place one, it&apos;ll appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ui-fg-subtle">
          <span className="font-semibold uppercase tracking-[0.08em]">
            Destination
          </span>
          <select
            value={destFilter}
            onChange={(e) => setDestFilter(e.target.value)}
            className="rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
          >
            <option value="all">All destinations</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="mt-4 divide-y divide-ui-border-base rounded-2xl border border-ui-border-base bg-white">
        {filtered.map((o) => (
          <li key={o.id}>
            <LocalizedClientLink
              href={`/account/organisations/${orgId}/orders/${o.id}`}
              className="flex flex-col gap-1 px-5 py-4 hover:bg-ui-bg-subtle phone:flex-row phone:items-center phone:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-ui-fg-base">
                  #{o.display_id}
                </p>
                <p className="text-xs text-ui-fg-muted">
                  {new Date(o.created_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  · {o.quantity_total} unit{o.quantity_total === 1 ? "" : "s"}
                  {o.destination_id && destById[o.destination_id] ? (
                    <>
                      {" · "}
                      {destById[o.destination_id].name}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-ui-bg-subtle px-3 py-1 text-xs font-semibold text-ui-fg-base">
                  {o.production_stage
                    ? STAGE_LABELS[o.production_stage] ?? o.production_stage
                    : "Received"}
                </span>
                <span className="text-xs text-ui-fg-muted">
                  {formatCurrency(o.total, o.currency_code)}
                </span>
                <span aria-hidden className="hidden text-ui-fg-muted phone:inline">
                  →
                </span>
              </div>
            </LocalizedClientLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
