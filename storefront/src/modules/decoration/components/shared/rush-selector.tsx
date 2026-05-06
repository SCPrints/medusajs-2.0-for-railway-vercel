"use client"

import React from "react"
import type { DecorationMethod, RushTier } from "../../lib/types"
import { RUSH_FEES, TURNAROUNDS } from "../../lib/rush"

type Props = {
  method: DecorationMethod
  value: RushTier
  onChange: (next: RushTier) => void
}

const RushSelector: React.FC<Props> = ({ method, value, onChange }) => {
  const fees = RUSH_FEES[method]
  const turnaround = TURNAROUNDS[method]

  const Row: React.FC<{
    tier: RushTier
    label: string
    note: string
    fee: number | null
    disabled?: boolean
  }> = ({ tier, label, note, fee, disabled }) => (
    <label
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        value === tier ? "border-[var(--brand-primary,#002a5c)] bg-ui-bg-subtle" : "border-ui-border-base"
      } ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={`rush-${method}`}
          checked={value === tier}
          onChange={() => !disabled && onChange(tier)}
          disabled={disabled}
        />
        <span>
          <span className="font-medium text-ui-fg-base">{label}</span>{" "}
          <span className="text-ui-fg-subtle">{note}</span>
        </span>
      </span>
      <span className="tabular-nums text-ui-fg-subtle">
        {fee === null ? "Not available" : fee === 0 ? "Included" : `+$${fee.toFixed(2)}`}
      </span>
    </label>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-ui-fg-base">Turnaround</div>
      <Row tier="standard" label="Standard" note={turnaround.standard} fee={0} />
      {turnaround.priority && (
        <Row tier="priority" label="Priority" note={turnaround.priority} fee={fees.priority} />
      )}
      {turnaround.express && (
        <Row
          tier="express"
          label="Express"
          note={turnaround.express}
          fee={fees.express}
          disabled={fees.express === null}
        />
      )}
    </div>
  )
}

export default RushSelector
