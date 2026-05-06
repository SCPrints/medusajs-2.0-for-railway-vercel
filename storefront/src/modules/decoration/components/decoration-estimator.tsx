"use client"

import React, { useState } from "react"
import { EmbroideryPanel } from "@modules/embroidery/components"
import { DECORATION_METHOD_LABELS, type DecorationMethod } from "../lib/types"
import DtfEstimator from "./methods/dtf-estimator"
import ScreenEstimator from "./methods/screen-estimator"
import UvdtfSheetEstimator from "./methods/uvdtf-sheet-estimator"
import UvdtfAppliedEstimator from "./methods/uvdtf-applied-estimator"
import UvPlaceholder from "./methods/uv-placeholder"

type Props = {
  methods: DecorationMethod[]
  initialMethod?: DecorationMethod
}

const renderMethod = (method: DecorationMethod) => {
  switch (method) {
    case "embroidery":
      return <EmbroideryPanel />
    case "dtf":
      return <DtfEstimator />
    case "screen":
      return <ScreenEstimator />
    case "uvdtf_sheet":
      return <UvdtfSheetEstimator />
    case "uvdtf_applied":
      return <UvdtfAppliedEstimator />
    case "uv":
      return <UvPlaceholder />
  }
}

const DecorationEstimator: React.FC<Props> = ({ methods, initialMethod }) => {
  const enabled = methods.length > 0 ? methods : (["embroidery"] as DecorationMethod[])
  const [active, setActive] = useState<DecorationMethod>(
    initialMethod && enabled.includes(initialMethod) ? initialMethod : enabled[0]
  )

  return (
    <div className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base bg-ui-bg-base p-5">
      <div>
        <h3 className="text-lg font-semibold text-ui-fg-base">Decoration estimator</h3>
        <p className="text-sm text-ui-fg-subtle">
          Pick a method and we'll estimate your decoration cost. All prices ex-GST; final pricing
          confirmed before production.
        </p>
      </div>

      {enabled.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-ui-border-base text-sm">
          {enabled.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setActive(m)}
              className={`-mb-px border-b-2 px-3 py-2 ${
                active === m
                  ? "border-[var(--brand-primary,#002a5c)] text-ui-fg-base"
                  : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
              }`}
            >
              {DECORATION_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      <div>{renderMethod(active)}</div>
    </div>
  )
}

export default DecorationEstimator
