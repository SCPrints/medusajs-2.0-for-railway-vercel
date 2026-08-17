"use client"

import React, { useMemo, useState } from "react"
import { calculateScreenPrice, SCREEN_MAX_COLOURS } from "../../lib/methods/screen"
import type { RushTier } from "../../lib/types"
import PriceSummary from "../shared/price-summary"
import QuantityInput from "../shared/quantity-input"
import RushSelector from "../shared/rush-selector"

const ScreenEstimator: React.FC = () => {
  const [colours, setColours] = useState(2)
  const [darkGarment, setDarkGarment] = useState(false)
  const [heavyGarment, setHeavyGarment] = useState(false)
  const [quantity, setQuantity] = useState(50)
  const [rushTier, setRushTier] = useState<RushTier>("standard")
  const [reorder, setReorder] = useState(false)

  const breakdown = useMemo(
    () => calculateScreenPrice({ colours, darkGarment, heavyGarment, quantity, rushTier, reorder }),
    [colours, darkGarment, heavyGarment, quantity, rushTier, reorder]
  )

  // Dark garment uses one of your colour slots — show effective max in the selector.
  const maxColoursForDesign = darkGarment ? SCREEN_MAX_COLOURS - 1 : SCREEN_MAX_COLOURS

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ui-fg-subtle">
            Design colours (max {maxColoursForDesign}{darkGarment ? " — dark garment uses 1 slot" : ""})
          </span>
          <select
            value={Math.min(colours, maxColoursForDesign)}
            onChange={(e) => setColours(Number(e.target.value))}
            className="rounded-md border border-ui-border-base px-3 py-2"
          >
            {Array.from({ length: maxColoursForDesign }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} colour{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <QuantityInput value={quantity} onChange={setQuantity} min={1} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={darkGarment}
            onChange={(e) => setDarkGarment(e.target.checked)}
          />
          <span>Dark garment (adds white underbase as one of the 6 screens)</span>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={heavyGarment}
            onChange={(e) => setHeavyGarment(e.target.checked)}
          />
          <span>Hoodies / fleece / poly garments (+$1.00 per print)</span>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={reorder}
            onChange={(e) => setReorder(e.target.checked)}
          />
          <span>Repeat order — same design within 6 months (reduced screen setup)</span>
        </label>
      </div>

      <RushSelector method="screen" value={rushTier} onChange={setRushTier} />
      <PriceSummary breakdown={breakdown} showAllInPerPiece />
    </div>
  )
}

export default ScreenEstimator
