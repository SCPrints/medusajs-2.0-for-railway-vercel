"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { placeOrganisationOrder } from "@lib/data/organisations"
import type {
  InventoryRow,
  OrganisationDesign,
  OrganisationDestination,
  OrgRole,
} from "@lib/data/organisations"

type Line = {
  id: string // org_inventory_id
  quantity: number
}

type Props = {
  orgId: string
  countryCode: string
  designs: OrganisationDesign[]
  destinations: OrganisationDestination[]
  inventory: InventoryRow[]
  role: OrgRole
}

function formatCurrency(amount: number | null | undefined, currency = "AUD") {
  if (amount == null) return "—"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function unitDollars(cents: number) {
  return cents / 100
}

export default function NewOrderForm({
  orgId,
  countryCode,
  designs,
  destinations,
  inventory,
  role,
}: Props) {
  const router = useRouter()
  const [destinationId, setDestinationId] = useState<string>(
    () => destinations.find((d) => d.is_active)?.id ?? ""
  )
  const [lines, setLines] = useState<Line[]>([])
  const [externalRef, setExternalRef] = useState("")
  const [requiredBy, setRequiredBy] = useState("")
  const [notes, setNotes] = useState("")

  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const inventoryById = useMemo(() => {
    const map: Record<string, InventoryRow> = {}
    for (const r of inventory) map[r.id] = r
    return map
  }, [inventory])

  const canPlace = role === "owner" || role === "purchaser"
  const activeDestinations = destinations.filter((d) => d.is_active)

  const total = lines.reduce((sum, l) => {
    const inv = inventoryById[l.id]
    if (!inv) return sum
    return sum + unitDollars(inv.unit_price) * l.quantity
  }, 0)

  const allQuantitiesValid = lines.every((l) => l.quantity > 0)
  const canSubmit =
    canPlace &&
    !!destinationId &&
    lines.length > 0 &&
    allQuantitiesValid &&
    !submitting

  function addLine(invId: string, quantity: number) {
    setLines((current) => {
      const existing = current.find((l) => l.id === invId)
      if (existing) {
        return current.map((l) =>
          l.id === invId ? { ...l, quantity: l.quantity + quantity } : l
        )
      }
      return [...current, { id: invId, quantity }]
    })
  }

  function updateQty(invId: string, quantity: number) {
    setLines((current) =>
      current.map((l) =>
        l.id === invId ? { ...l, quantity: Math.max(0, quantity) } : l
      )
    )
  }

  function removeLine(invId: string) {
    setLines((current) => current.filter((l) => l.id !== invId))
  }

  async function actuallySubmit() {
    setSubmitting(true)
    setSubmitError(null)
    const res = await placeOrganisationOrder(orgId, {
      destination_id: destinationId,
      items: lines.map((l) => ({
        org_inventory_id: l.id,
        quantity: l.quantity,
      })),
      external_ref: externalRef.trim() || undefined,
      required_by: requiredBy.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    setSubmitting(false)
    if (res.ok) {
      router.push(
        `/${countryCode}/account/organisations/${orgId}/orders/${res.order_id}`
      )
    } else {
      setSubmitError(res.error)
      setConfirmOpen(false)
    }
  }

  const chosenDestination = destinations.find((d) => d.id === destinationId)

  return (
    <div className="flex flex-col gap-8 pb-32 small:pb-0">
      {/* 1. Destination */}
      <section>
        <h2 className="text-sm font-semibold text-ui-fg-base">
          1. Where is this going?
        </h2>
        <p className="mt-1 text-xs text-ui-fg-muted">
          Choose the destination receiving this restock. Each order ships to a
          single destination.
        </p>
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          className="mt-3 w-full rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11 phone:max-w-md"
          required
        >
          <option value="">Select a destination…</option>
          {activeDestinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.city}
            </option>
          ))}
        </select>
        {chosenDestination ? (
          <p className="mt-2 text-xs text-ui-fg-muted">
            {chosenDestination.address_1}, {chosenDestination.city}{" "}
            {chosenDestination.postal_code}
          </p>
        ) : null}
      </section>

      {/* 2. Items */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ui-fg-base">
            2. What do you need?
          </h2>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-full border border-[var(--brand-secondary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--brand-secondary)] transition hover:bg-[var(--brand-secondary)]/10 min-h-11"
          >
            + Add item
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-ui-border-base bg-white p-8 text-center">
            <p className="text-sm text-ui-fg-subtle">
              No items yet. Pick a design and choose your sizes.
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-ui-border-base bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-ui-border-base bg-ui-bg-subtle text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Design</th>
                  <th className="hidden px-3 py-3 text-left font-semibold tablet:table-cell">
                    Garment
                  </th>
                  <th className="hidden px-3 py-3 text-left font-semibold tablet:table-cell">
                    Mode
                  </th>
                  <th className="hidden px-3 py-3 text-right font-semibold tablet:table-cell">
                    Avail
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="px-3 py-3 text-right font-semibold">Line</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-base">
                {lines.map((line) => {
                  const inv = inventoryById[line.id]
                  if (!inv) return null
                  const lineTotal =
                    unitDollars(inv.unit_price) * line.quantity
                  const overAllocated =
                    inv.fulfillment_mode === "held_stock" &&
                    line.quantity > inv.available
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-3 align-middle">
                        <p className="text-ui-fg-base">
                          {inv.design_name ?? "—"}
                        </p>
                        <p className="text-xs text-ui-fg-muted tablet:hidden">
                          {inv.customer_facing_label ||
                            inv.variant_title ||
                            "—"}
                        </p>
                      </td>
                      <td className="hidden px-3 py-3 align-middle text-ui-fg-base tablet:table-cell">
                        {inv.customer_facing_label ||
                          [inv.product_title, inv.variant_title]
                            .filter(Boolean)
                            .join(" · ") ||
                          "—"}
                      </td>
                      <td className="hidden px-3 py-3 align-middle tablet:table-cell">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            inv.fulfillment_mode === "held_stock"
                              ? "bg-[var(--brand-accent)]/15 text-[var(--brand-primary)]"
                              : "bg-ui-bg-subtle text-ui-fg-subtle"
                          }`}
                        >
                          {inv.fulfillment_mode === "held_stock"
                            ? "Held"
                            : "PoD"}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 text-right tabular-nums text-ui-fg-subtle tablet:table-cell">
                        {inv.fulfillment_mode === "held_stock"
                          ? inv.available
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateQty(
                              line.id,
                              Number(e.target.value.replace(/[^\d]/g, "")) || 0
                            )
                          }
                          className="w-20 rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
                        />
                        {overAllocated ? (
                          <p className="mt-1 text-[11px] text-amber-700">
                            +{line.quantity - inv.available} we&apos;ll print
                            {inv.lead_time_days
                              ? ` (≈${inv.lead_time_days}d)`
                              : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-xs font-semibold text-rose-700 hover:underline min-h-11 px-1"
                          aria-label="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Anything else? */}
      <section>
        <h2 className="text-sm font-semibold text-ui-fg-base">
          3. Anything else?
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 phone:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
              Your ref (optional)
            </span>
            <input
              type="text"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value.slice(0, 120))}
              placeholder="PO#, internal ref, etc."
              className="rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
              Need by (optional)
            </span>
            <input
              type="date"
              value={requiredBy}
              onChange={(e) => setRequiredBy(e.target.value)}
              className="rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11"
            />
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Any special instructions for our production team."
            className="rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
          />
        </label>
      </section>

      {submitError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {submitError}
        </div>
      ) : null}

      {/* Sticky / inline submit row */}
      <div
        className="sticky bottom-0 left-0 right-0 -mx-4 flex flex-col items-stretch gap-3 border-t border-ui-border-base bg-white px-4 py-3 small:static small:mx-0 small:flex-row small:items-center small:justify-between small:rounded-2xl small:border small:bg-white small:px-5 small:py-4"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-xs uppercase tracking-[0.1em] text-ui-fg-muted">
            Total
          </span>
          <span className="text-xl font-semibold tabular-nums text-ui-fg-base">
            {formatCurrency(total)}
          </span>
          <span className="text-xs text-ui-fg-muted">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex gap-2 small:gap-3">
          <LocalizedClientLink
            href={`/account/organisations/${orgId}#overview`}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-ui-border-base px-4 py-2.5 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle min-h-11 small:flex-none"
          >
            Cancel
          </LocalizedClientLink>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[var(--brand-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-secondary)]/90 disabled:cursor-not-allowed disabled:opacity-50 min-h-11 small:flex-none"
          >
            Submit order
          </button>
        </div>
      </div>

      {pickerOpen ? (
        <AddItemPicker
          designs={designs.filter((d) => d.is_active)}
          inventory={inventory}
          existingLines={lines}
          onClose={() => setPickerOpen(false)}
          onAdd={(invId, qty) => {
            addLine(invId, qty)
          }}
        />
      ) : null}

      {confirmOpen ? (
        <ConfirmModal
          total={total}
          lineCount={lines.length}
          destinationName={chosenDestination?.name ?? ""}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={actuallySubmit}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Two-step add-item modal (design tile → SKU picker)
 * ------------------------------------------------------------------ */

function AddItemPicker({
  designs,
  inventory,
  existingLines,
  onClose,
  onAdd,
}: {
  designs: OrganisationDesign[]
  inventory: InventoryRow[]
  existingLines: Line[]
  onClose: () => void
  onAdd: (invId: string, qty: number) => void
}) {
  const [step, setStep] = useState<"design" | "sku">("design")
  const [chosenDesign, setChosenDesign] = useState<OrganisationDesign | null>(
    null
  )

  const designsWithSkus = useMemo(
    () =>
      designs.filter((d) =>
        inventory.some(
          (i) => i.organisation_design_id === d.id && i.is_active
        )
      ),
    [designs, inventory]
  )

  const skusForDesign = useMemo(() => {
    if (!chosenDesign) return []
    return inventory.filter(
      (i) =>
        i.organisation_design_id === chosenDesign.id && i.is_active
    )
  }, [chosenDesign, inventory])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add item"
      className="fixed inset-0 z-[80] flex items-end justify-center small:items-center small:p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl small:max-w-3xl small:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between border-b border-ui-border-base px-5 py-3">
          <h3 className="text-base font-semibold text-ui-fg-base">
            {step === "design" ? "Pick a design" : chosenDesign?.name ?? "Pick a SKU"}
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
          {step === "design" ? (
            designsWithSkus.length === 0 ? (
              <p className="text-sm text-ui-fg-subtle">
                No designs with active SKUs. Contact SC Prints.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 phone:grid-cols-3 small:grid-cols-4">
                {designsWithSkus.map((d) => {
                  const skuCount = inventory.filter(
                    (i) => i.organisation_design_id === d.id && i.is_active
                  ).length
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setChosenDesign(d)
                        setStep("sku")
                      }}
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
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 px-3 py-2">
                        <p className="text-sm font-semibold text-ui-fg-base">
                          {d.name}
                        </p>
                        <p className="text-xs text-ui-fg-muted">
                          {skuCount} SKU{skuCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <SkuPicker
              skus={skusForDesign}
              existingLines={existingLines}
              onAdd={(invId, qty) => {
                onAdd(invId, qty)
                onClose()
              }}
              onBack={() => setStep("design")}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SkuPicker({
  skus,
  existingLines,
  onAdd,
  onBack,
}: {
  skus: InventoryRow[]
  existingLines: Line[]
  onAdd: (invId: string, qty: number) => void
  onBack: () => void
}) {
  const [draftQty, setDraftQty] = useState<Record<string, number>>({})

  function getCurrent(invId: string) {
    return draftQty[invId] ?? 0
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs font-semibold text-[var(--brand-secondary)] hover:underline min-h-11 px-1"
      >
        ← Change design
      </button>
      <ul className="flex flex-col gap-2">
        {skus.map((r) => {
          const inUseAlready = existingLines.find((l) => l.id === r.id)
          const current = getCurrent(r.id)
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ui-border-base px-3 py-2"
            >
              <div className="flex-1">
                <p className="text-sm text-ui-fg-base">
                  {r.customer_facing_label ||
                    [r.product_title, r.variant_title]
                      .filter(Boolean)
                      .join(" · ") ||
                    "—"}
                </p>
                <p className="text-[11px] text-ui-fg-muted">
                  {r.fulfillment_mode === "held_stock"
                    ? `${r.available} available`
                    : "Print on demand"}
                  {inUseAlready ? (
                    <>
                      {" · "}
                      {inUseAlready.quantity} already in cart
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={current}
                  onChange={(e) =>
                    setDraftQty((prev) => ({
                      ...prev,
                      [r.id]: Math.max(
                        0,
                        Number(e.target.value.replace(/[^\d]/g, "")) || 0
                      ),
                    }))
                  }
                  className="w-20 rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11"
                />
                <button
                  type="button"
                  disabled={current <= 0}
                  onClick={() => {
                    onAdd(r.id, current)
                  }}
                  className="rounded-full bg-[var(--brand-secondary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-secondary)]/90 disabled:cursor-not-allowed disabled:opacity-50 min-h-11"
                >
                  Add
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ConfirmModal({
  total,
  lineCount,
  destinationName,
  submitting,
  onCancel,
  onConfirm,
}: {
  total: number
  lineCount: number
  destinationName: string
  submitting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm order"
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="px-5 pt-5">
          <h3 className="text-lg font-semibold text-ui-fg-base">
            Place this order?
          </h3>
          <p className="mt-2 text-sm text-ui-fg-subtle">
            Shipping to{" "}
            <span className="font-semibold text-ui-fg-base">
              {destinationName || "—"}
            </span>
            . {lineCount} line{lineCount === 1 ? "" : "s"} totalling{" "}
            <span className="font-semibold text-ui-fg-base">
              {formatCurrency(total)}
            </span>
            .
          </p>
          <p className="mt-2 text-xs text-ui-fg-muted">
            You can cancel from the order detail page within 24 hours.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-ui-border-base px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full border border-ui-border-base px-4 py-2 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle disabled:opacity-50 min-h-11"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-full bg-[var(--brand-secondary)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-secondary)]/90 disabled:opacity-60 min-h-11"
          >
            {submitting ? "Placing…" : "Place order"}
          </button>
        </div>
      </div>
    </div>
  )
}
