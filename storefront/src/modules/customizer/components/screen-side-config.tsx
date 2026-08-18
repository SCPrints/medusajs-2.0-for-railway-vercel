"use client"

import React, { useState } from "react"
import type { GarmentSide, ScreenConfig } from "@modules/customizer/lib/types"
import {
  SCREEN_MAX_COLOURS,
  SCREEN_MIN_QUANTITY,
  SCREEN_SETUP_PER_SCREEN_MAJOR,
  screenUnitMajor,
} from "@modules/customizer/lib/scp-screen-print-pricing"

type Props = {
  side: GarmentSide
  value: ScreenConfig | undefined
  onChange: (side: GarmentSide, next: ScreenConfig) => void
  /** Current total quantity — used for the live unit-price hint. */
  totalQuantity: number
  /** Product-level heavy-garment flag (hoodies/fleece/poly, +$1/print). */
  heavyGarment?: boolean
}

/**
 * Per-side screen-print configuration. Drives the screen cost for one
 * decorated side: colour count (1–6) and a dark-garment toggle (white
 * underbase consumes one colour slot). The resulting ScreenConfig flows
 * into cart metadata + pricing; setup fees land as a separate cart line.
 *
 * Used inside Step 3 of the customizer wizard when the side's decoration
 * method is "screen". Parent must remount on side change (key={side}) —
 * local state seeds from `value` on mount only, same as EmbroiderySideConfig.
 */
const ScreenSideConfig: React.FC<Props> = ({
  side,
  value,
  onChange,
  totalQuantity,
  heavyGarment,
}) => {
  const [colours, setColours] = useState<number>(value?.colours ?? 1)
  const [darkGarment, setDarkGarment] = useState<boolean>(value?.darkGarment ?? false)

  const commit = (nextColours: number, nextDark: boolean) => {
    onChange(side, { side, colours: nextColours, darkGarment: nextDark })
  }

  const { unitMajor, effectiveColours } = screenUnitMajor({
    quantity: totalQuantity,
    colours,
    darkGarment,
    heavyGarment,
  })
  const screens = effectiveColours
  const belowMin = totalQuantity < SCREEN_MIN_QUANTITY
  const maxSelectable = darkGarment ? SCREEN_MAX_COLOURS - 1 : SCREEN_MAX_COLOURS

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ui-fg-subtle">
          Ink colours in your design (max {maxSelectable}
          {darkGarment ? " — dark garment uses 1 slot for the white underbase" : ""})
        </span>
        <select
          value={Math.min(colours, maxSelectable)}
          onChange={(e) => {
            const next = Number(e.target.value)
            setColours(next)
            commit(next, darkGarment)
          }}
          className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2"
        >
          {Array.from({ length: maxSelectable }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} colour{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={darkGarment}
          onChange={(e) => {
            const next = e.target.checked
            setDarkGarment(next)
            const clamped = Math.min(colours, next ? SCREEN_MAX_COLOURS - 1 : SCREEN_MAX_COLOURS)
            if (clamped !== colours) setColours(clamped)
            commit(clamped, next)
          }}
        />
        <span>Dark garment (needs a white underbase screen)</span>
      </label>
      <div className="text-xs text-ui-fg-subtle">
        ${unitMajor.toFixed(2)} per print at this quantity · {screens} screen
        {screens > 1 ? "s" : ""} × ${SCREEN_SETUP_PER_SCREEN_MAJOR} setup added at checkout
        {heavyGarment ? " · incl. $1.00 heavy-garment surcharge" : ""}
      </div>
      {belowMin ? (
        <div className="text-xs font-medium text-ui-fg-error">
          Screen printing needs at least {SCREEN_MIN_QUANTITY} pieces — increase the quantity
          or switch this side to Print (DTF).
        </div>
      ) : null}
    </div>
  )
}

export default ScreenSideConfig
