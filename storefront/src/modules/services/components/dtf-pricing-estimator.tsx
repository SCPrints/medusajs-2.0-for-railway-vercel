"use client"

import { useMemo, useState } from "react"
import { ServicePricingTable } from "@modules/services/data"

type DtfPricingEstimatorProps = {
  pricing: ServicePricingTable
}

const formatMoney = (amountCents: number, currencyCode: string) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amountCents / 100)

const resolveTierIndexForQuantity = (pricing: ServicePricingTable, quantity: number) => {
  const safeQuantity = Math.max(1, Math.floor(quantity))

  const matchingIndex = pricing.quantityTiers.findIndex((tier) => {
    if (safeQuantity < tier.minQuantity) {
      return false
    }
    if (typeof tier.maxQuantity === "number" && safeQuantity > tier.maxQuantity) {
      return false
    }
    return true
  })

  return matchingIndex >= 0 ? matchingIndex : pricing.quantityTiers.length - 1
}

export default function DtfPricingEstimator({ pricing }: DtfPricingEstimatorProps) {
  const [selectedPrintArea, setSelectedPrintArea] = useState(pricing.rows[0]?.printAreaLabel ?? "")
  const [quantity, setQuantity] = useState(1)

  const safeQuantity = Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1))

  const selectedRow =
    pricing.rows.find((row) => row.printAreaLabel === selectedPrintArea) ?? pricing.rows[0]

  const activeTierIndex = resolveTierIndexForQuantity(pricing, safeQuantity)
  const activeTier = pricing.quantityTiers[activeTierIndex]

  const unitPriceCents = useMemo(() => {
    if (!selectedRow) {
      return 0
    }
    return selectedRow.pricesByTierCents[activeTierIndex] ?? selectedRow.pricesByTierCents[0] ?? 0
  }, [activeTierIndex, selectedRow])

  const totalPriceCents = unitPriceCents * safeQuantity

  return (
    <div className="mt-5 rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 p-4">
      <h3 className="text-sm font-semibold text-ui-fg-base">Quick DTF price estimator</h3>
      <p className="mt-1 text-xs text-ui-fg-subtle">
        Select print area and garment quantity to preview per-unit and total pricing.
      </p>

      <div className="mt-4 grid gap-3 small:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-ui-fg-subtle">Print area</span>
          <select
            className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
            value={selectedPrintArea}
            onChange={(event) => setSelectedPrintArea(event.target.value)}
          >
            {pricing.rows.map((row) => (
              <option key={row.printAreaLabel} value={row.printAreaLabel}>
                {row.printAreaLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-ui-fg-subtle">Garment quantity</span>
          <input
            type="number"
            min={1}
            max={100000}
            className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
            value={safeQuantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <p className="flex items-center justify-between">
          <span className="text-ui-fg-subtle">Applied quantity tier</span>
          <span className="font-medium text-ui-fg-base">{activeTier?.label ?? "N/A"}</span>
        </p>
        <p className="flex items-center justify-between">
          <span className="text-ui-fg-subtle">Unit price</span>
          <span className="font-medium text-ui-fg-base">
            {formatMoney(unitPriceCents, pricing.currencyCode)}
          </span>
        </p>
        <p className="flex items-center justify-between text-base font-semibold">
          <span className="text-ui-fg-base">Estimated total</span>
          <span className="text-ui-fg-base">{formatMoney(totalPriceCents, pricing.currencyCode)}</span>
        </p>
      </div>
    </div>
  )
}
