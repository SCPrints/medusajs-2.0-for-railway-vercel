"use client"

import React from "react"

type Props = {
  label?: string
  value: number
  min?: number
  step?: number
  onChange: (next: number) => void
  suffix?: string
  className?: string
}

const QuantityInput: React.FC<Props> = ({
  label = "Quantity",
  value,
  min = 1,
  step = 1,
  onChange,
  suffix,
  className,
}) => (
  <label className={`flex items-center gap-3 text-sm ${className ?? ""}`}>
    <span className="w-28 text-ui-fg-subtle">{label}</span>
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!Number.isFinite(n)) return
        onChange(Math.max(min, n))
      }}
      className="w-32 rounded-md border border-ui-border-base px-3 py-2"
    />
    {suffix && <span className="text-ui-fg-muted">{suffix}</span>}
  </label>
)

export default QuantityInput
