"use client"

import React from "react"
import type { Breakdown } from "../../lib/types"
import { amortisedPerPiece } from "../../lib/setup"

type Props = {
  breakdown: Breakdown
  /** When true, shows an "all-in per piece" line that amortises setup across qty. */
  showAllInPerPiece?: boolean
}

const fmt = (n: number) => `$${n.toFixed(2)}`

const PriceSummary: React.FC<Props> = ({ breakdown, showAllInPerPiece }) => {
  const allIn = showAllInPerPiece
    ? amortisedPerPiece(breakdown.unitPrice, breakdown.setupTotal + breakdown.rushSurcharge, breakdown.quantity)
    : null

  return (
    <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-4 text-sm">
      <Row label="Per unit" value={fmt(breakdown.unitPrice)} />
      <Row label={`× ${breakdown.quantity}`} value={fmt(breakdown.decorationSubtotal)} />
      {breakdown.setupTotal > 0 && <Row label="Setup" value={fmt(breakdown.setupTotal)} />}
      {breakdown.rushSurcharge > 0 && (
        <Row label="Priority/Express" value={fmt(breakdown.rushSurcharge)} />
      )}
      <Row label="Subtotal (ex-GST)" value={fmt(breakdown.subtotalExGst)} />
      <Row label="GST (10%)" value={fmt(breakdown.gst)} />
      <Row label="Total (inc-GST)" value={fmt(breakdown.totalIncGst)} bold />
      {allIn !== null && breakdown.quantity > 0 && (
        <div className="mt-2 border-t border-ui-border-base pt-2 text-xs text-ui-fg-subtle">
          All-in per piece (incl. setup, ex-GST):{" "}
          <span className="font-medium text-ui-fg-base">{fmt(allIn)}</span>
        </div>
      )}
      {breakdown.notes?.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ui-fg-subtle">
          {breakdown.notes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const Row: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <div className={`flex items-center justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
    <span className="text-ui-fg-subtle">{label}</span>
    <span className="tabular-nums text-ui-fg-base">{value}</span>
  </div>
)

export default PriceSummary
