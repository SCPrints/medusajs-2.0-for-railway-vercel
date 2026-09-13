"use client"

import React, { useMemo, useState } from "react"
import {
  calculateUvdtfAppliedPrice,
  UVDTF_APPLIED_SUBSTRATES,
  type UvdtfAppliedSubstrate,
} from "../../lib/methods/uvdtf-applied"
import type { RushTier } from "../../lib/types"
import PriceSummary from "../shared/price-summary"
import QuantityInput from "../shared/quantity-input"
import RushSelector from "../shared/rush-selector"

const UvdtfAppliedEstimator: React.FC = () => {
  const [metres, setMetres] = useState(1)
  const [substrate, setSubstrate] = useState<UvdtfAppliedSubstrate>("hard_surface")
  const [rushTier, setRushTier] = useState<RushTier>("standard")
  const [reorder, setReorder] = useState(false)

  const breakdown = useMemo(
    () => calculateUvdtfAppliedPrice({ metres, substrate, rushTier, reorder }),
    [metres, substrate, rushTier, reorder]
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
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ui-fg-subtle">Substrate</span>
          <select
            value={substrate}
            onChange={(e) => setSubstrate(e.target.value as UvdtfAppliedSubstrate)}
            className="rounded-md border border-ui-border-base px-3 py-2"
          >
            {UVDTF_APPLIED_SUBSTRATES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={reorder} onChange={(e) => setReorder(e.target.checked)} />
          <span>This is a reorder (waives $30 setup)</span>
        </label>
      </div>

      <RushSelector method="uvdtf_applied" value={rushTier} onChange={setRushTier} />
      <PriceSummary breakdown={breakdown} />
    </div>
  )
}

export default UvdtfAppliedEstimator
