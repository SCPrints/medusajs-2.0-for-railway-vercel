"use client"

import React, { useMemo, useState } from "react"
import { calculateDtfPrice, DTF_SIZE_OPTIONS } from "../../lib/methods/dtf"
import type { ScpPrintSizeId } from "@modules/customizer/lib/scp-dtf-print-pricing"
import type { RushTier } from "../../lib/types"
import PriceSummary from "../shared/price-summary"
import QuantityInput from "../shared/quantity-input"
import RushSelector from "../shared/rush-selector"

const DtfEstimator: React.FC = () => {
  const [sizeId, setSizeId] = useState<ScpPrintSizeId>("up_to_a4")
  const [quantity, setQuantity] = useState(25)
  const [rushTier, setRushTier] = useState<RushTier>("standard")
  const [reorder, setReorder] = useState(false)

  const breakdown = useMemo(
    () => calculateDtfPrice({ sizeId, quantity, rushTier, reorder }),
    [sizeId, quantity, rushTier, reorder]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ui-fg-subtle">Print size</span>
          <select
            value={sizeId}
            onChange={(e) => setSizeId(e.target.value as ScpPrintSizeId)}
            className="rounded-md border border-ui-border-base px-3 py-2"
          >
            {DTF_SIZE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} — {opt.dimensionsLabel}
              </option>
            ))}
          </select>
        </label>
        <QuantityInput value={quantity} onChange={setQuantity} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={reorder} onChange={(e) => setReorder(e.target.checked)} />
          <span>This is a reorder (waives $25 artwork setup)</span>
        </label>
      </div>

      <RushSelector method="dtf" value={rushTier} onChange={setRushTier} />
      <PriceSummary breakdown={breakdown} />
    </div>
  )
}

export default DtfEstimator
