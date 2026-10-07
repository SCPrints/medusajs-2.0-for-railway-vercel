"use client"

import React, { useMemo, useState } from "react"
import {
  calculateUvdtfSheetPrice,
  UVDTF_SHEET_SETUP_FEE,
  UVDTF_SHEET_WIDTH_MM,
} from "../../lib/methods/uvdtf-sheet"
import type { RushTier } from "../../lib/types"
import PriceSummary from "../shared/price-summary"
import QuantityInput from "../shared/quantity-input"
import RushSelector from "../shared/rush-selector"

const UvdtfSheetEstimator: React.FC = () => {
  const [metres, setMetres] = useState(1)
  const [rushTier, setRushTier] = useState<RushTier>("standard")
  const [reorder, setReorder] = useState(false)

  const breakdown = useMemo(
    () => calculateUvdtfSheetPrice({ metres, rushTier, reorder }),
    [metres, rushTier, reorder]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuantityInput
          label="Length (metres)"
          value={metres}
          onChange={setMetres}
          min={1}
          step={1}
          suffix={`@ ${UVDTF_SHEET_WIDTH_MM}mm wide`}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reorder} onChange={(e) => setReorder(e.target.checked)} />
          <span>This is a reorder (waives ${UVDTF_SHEET_SETUP_FEE} setup)</span>
        </label>
      </div>

      <RushSelector method="uvdtf_sheet" value={rushTier} onChange={setRushTier} />
      <PriceSummary breakdown={breakdown} />
    </div>
  )
}

export default UvdtfSheetEstimator
