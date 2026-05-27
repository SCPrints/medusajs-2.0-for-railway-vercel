"use client"

import { useState } from "react"
import type {
  InventoryRow,
  OrganisationDesign,
} from "@lib/data/organisations"

type Props = {
  designs: OrganisationDesign[]
  inventory: InventoryRow[]
}

export default function DesignsTab({ designs, inventory }: Props) {
  const [active, setActive] = useState<OrganisationDesign | null>(null)
  const activeDesigns = designs.filter((d) => d.is_active)

  if (activeDesigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ui-border-base bg-white p-10 text-center">
        <p className="text-sm text-ui-fg-subtle">
          No designs yet. Once SC Prints adds your approved artwork, it&apos;ll
          appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 phone:grid-cols-3 small:grid-cols-4">
        {activeDesigns.map((d) => {
          const skuCount = inventory.filter(
            (i) => i.organisation_design_id === d.id
          ).length
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setActive(d)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-ui-border-base bg-white text-left transition hover:border-[var(--brand-secondary)]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
            >
              <div className="relative aspect-square w-full bg-ui-bg-subtle">
                {d.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.thumbnail_url}
                    alt={d.name}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-xs text-ui-fg-muted">
                    No thumbnail
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 px-3 py-3">
                <p className="text-sm font-semibold text-ui-fg-base">{d.name}</p>
                <p className="text-xs text-ui-fg-muted">
                  {skuCount} SKU{skuCount === 1 ? "" : "s"}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-ui-fg-muted">
        Need new artwork? Contact SC Prints to add a design.
      </p>

      {active ? (
        <DesignModal
          design={active}
          rows={inventory.filter((i) => i.organisation_design_id === active.id)}
          onClose={() => setActive(null)}
        />
      ) : null}
    </>
  )
}

function DesignModal({
  design,
  rows,
  onClose,
}: {
  design: OrganisationDesign
  rows: InventoryRow[]
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={design.name}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ui-border-base px-5 py-3">
          <h3 className="text-base font-semibold text-ui-fg-base">
            {design.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ui-fg-subtle hover:bg-ui-bg-subtle"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="aspect-square w-full overflow-hidden rounded-xl bg-ui-bg-subtle">
            {design.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={design.thumbnail_url}
                alt={design.name}
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Available on
          </h4>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-ui-fg-subtle">
              No SKUs currently mapped to this design.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-ui-border-base rounded-xl border border-ui-border-base">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="text-ui-fg-base">
                    {r.customer_facing_label ||
                      [r.product_title, r.variant_title]
                        .filter(Boolean)
                        .join(" · ")}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      r.fulfillment_mode === "held_stock"
                        ? "bg-[var(--brand-accent)]/15 text-[var(--brand-primary)]"
                        : "bg-ui-bg-subtle text-ui-fg-subtle"
                    }`}
                  >
                    {r.fulfillment_mode === "held_stock" ? "Held" : "PoD"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
