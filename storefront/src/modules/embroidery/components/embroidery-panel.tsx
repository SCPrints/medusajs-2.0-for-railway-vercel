"use client"

import React, { useState } from "react"
import StitchEstimator from "./stitch-estimator"
import type { EmbroideryDesign } from "../lib/types"

/**
 * PDP-mountable wrapper that owns the estimator's quantity input.
 *
 * Phase 1 integration: this panel renders independently of the cart; the
 * design metadata is exposed via `onDesignChange` so a parent template can
 * forward it to `addToCart({ metadata: buildEmbroideryMetadata(design) })`
 * when wiring the cart flow. For the inline preview we keep the quantity
 * locally to keep the widget self-contained.
 */
const EmbroideryPanel: React.FC<{ onDesignChange?: (design: EmbroideryDesign | null) => void }> = ({
  onDesignChange,
}) => {
  const [quantity, setQuantity] = useState(24)

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-3 text-sm">
        <span className="w-28 text-ui-fg-subtle">Quantity</span>
        <input
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-28 rounded-md border border-ui-border-base px-3 py-2"
        />
      </label>
      <StitchEstimator quantity={quantity} onDesignChange={onDesignChange} />
    </div>
  )
}

export default EmbroideryPanel
