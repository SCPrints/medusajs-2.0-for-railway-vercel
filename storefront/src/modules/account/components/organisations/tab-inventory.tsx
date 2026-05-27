"use client"

import { useMemo, useState } from "react"
import type {
  InventoryRow,
  OrganisationDesign,
} from "@lib/data/organisations"

type Props = {
  inventory: InventoryRow[]
  designs: OrganisationDesign[]
}

type ModeFilter = "all" | "held_stock" | "print_on_demand"

export default function InventoryTab({ inventory, designs }: Props) {
  const [designFilter, setDesignFilter] = useState<string>("all")
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all")
  const [belowReorderOnly, setBelowReorderOnly] = useState(false)

  const filtered = useMemo(() => {
    return inventory.filter((r) => {
      if (designFilter !== "all" && r.organisation_design_id !== designFilter)
        return false
      if (modeFilter !== "all" && r.fulfillment_mode !== modeFilter) return false
      if (belowReorderOnly) {
        if (r.fulfillment_mode !== "held_stock") return false
        if (r.reorder_point == null) return false
        if (r.available > r.reorder_point) return false
      }
      return true
    })
  }, [inventory, designFilter, modeFilter, belowReorderOnly])

  const belowReorderCount = inventory.filter(
    (r) =>
      r.fulfillment_mode === "held_stock" &&
      r.reorder_point != null &&
      r.available <= r.reorder_point
  ).length

  if (inventory.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ui-border-base bg-white p-10 text-center">
        <p className="text-sm text-ui-fg-subtle">
          No inventory rows configured yet. Once SC Prints sets up your
          (design × garment) catalog, it&apos;ll appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ui-fg-subtle">
          <span className="font-semibold uppercase tracking-[0.08em]">
            Design
          </span>
          <select
            value={designFilter}
            onChange={(e) => setDesignFilter(e.target.value)}
            className="rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
          >
            <option value="all">All designs</option>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-ui-fg-subtle">
          <span className="font-semibold uppercase tracking-[0.08em]">
            Mode
          </span>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as ModeFilter)}
            className="rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
          >
            <option value="all">All modes</option>
            <option value="held_stock">Held stock</option>
            <option value="print_on_demand">Print on demand</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-ui-fg-subtle min-h-11">
          <input
            type="checkbox"
            checked={belowReorderOnly}
            onChange={(e) => setBelowReorderOnly(e.target.checked)}
            className="size-4 accent-[var(--brand-secondary)]"
          />
          Below reorder point
        </label>
      </div>

      {/* Summary line */}
      <p className="mt-3 text-xs text-ui-fg-muted">
        {filtered.length} of {inventory.length} SKUs
        {belowReorderCount > 0 ? (
          <>
            {" · "}
            <span className="font-semibold text-amber-600">
              {belowReorderCount} below reorder
            </span>
          </>
        ) : null}
      </p>

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-ui-border-base bg-white tablet:block">
        <table className="w-full text-sm">
          <thead className="border-b border-ui-border-base bg-ui-bg-subtle text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Design</th>
              <th className="px-3 py-3 text-left font-semibold">Garment</th>
              <th className="px-3 py-3 text-left font-semibold">Mode</th>
              <th className="px-3 py-3 text-right font-semibold">On hand</th>
              <th className="px-3 py-3 text-right font-semibold">Reserved</th>
              <th className="px-3 py-3 text-right font-semibold">Available</th>
              <th className="px-3 py-3 text-right font-semibold">Reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-border-base">
            {filtered.map((r) => {
              const lowStock =
                r.fulfillment_mode === "held_stock" &&
                r.reorder_point != null &&
                r.available <= r.reorder_point
              return (
                <tr key={r.id} className={lowStock ? "bg-amber-50/40" : ""}>
                  <td className="px-3 py-2 align-middle text-ui-fg-base">
                    {r.design_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-middle text-ui-fg-base">
                    {r.customer_facing_label ||
                      [r.product_title, r.variant_title]
                        .filter(Boolean)
                        .join(" · ") ||
                      "—"}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        r.fulfillment_mode === "held_stock"
                          ? "bg-[var(--brand-accent)]/15 text-[var(--brand-primary)]"
                          : "bg-ui-bg-subtle text-ui-fg-subtle"
                      }`}
                    >
                      {r.fulfillment_mode === "held_stock" ? "Held" : "PoD"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ui-fg-base">
                    {r.fulfillment_mode === "held_stock"
                      ? r.quantity_on_hand
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ui-fg-subtle">
                    {r.fulfillment_mode === "held_stock"
                      ? r.quantity_reserved
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span
                      className={
                        lowStock
                          ? "font-semibold text-amber-600"
                          : "text-ui-fg-base"
                      }
                    >
                      {r.fulfillment_mode === "held_stock" ? r.available : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ui-fg-subtle">
                    {r.reorder_point != null ? `≤ ${r.reorder_point}` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-4 flex flex-col gap-2 tablet:hidden">
        {filtered.map((r) => {
          const lowStock =
            r.fulfillment_mode === "held_stock" &&
            r.reorder_point != null &&
            r.available <= r.reorder_point
          return (
            <li
              key={r.id}
              className={`rounded-2xl border bg-white p-4 ${
                lowStock
                  ? "border-amber-300 bg-amber-50/40"
                  : "border-ui-border-base"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ui-fg-base">
                    {r.design_name ?? "—"}
                  </p>
                  <p className="text-xs text-ui-fg-muted">
                    {r.customer_facing_label ||
                      [r.product_title, r.variant_title]
                        .filter(Boolean)
                        .join(" · ") ||
                      "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    r.fulfillment_mode === "held_stock"
                      ? "bg-[var(--brand-accent)]/15 text-[var(--brand-primary)]"
                      : "bg-ui-bg-subtle text-ui-fg-subtle"
                  }`}
                >
                  {r.fulfillment_mode === "held_stock" ? "Held" : "PoD"}
                </span>
              </div>
              {r.fulfillment_mode === "held_stock" ? (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-ui-fg-muted">On hand</dt>
                    <dd className="font-semibold tabular-nums text-ui-fg-base">
                      {r.quantity_on_hand}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ui-fg-muted">Reserved</dt>
                    <dd className="font-semibold tabular-nums text-ui-fg-base">
                      {r.quantity_reserved}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ui-fg-muted">Avail</dt>
                    <dd
                      className={`font-semibold tabular-nums ${
                        lowStock ? "text-amber-600" : "text-ui-fg-base"
                      }`}
                    >
                      {r.available}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-xs text-ui-fg-muted">
                  Print on demand — no held stock.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
