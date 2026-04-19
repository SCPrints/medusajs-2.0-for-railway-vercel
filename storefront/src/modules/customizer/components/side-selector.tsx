"use client"

import { GarmentSide } from "@modules/customizer/lib/types"

const SIDE_OPTIONS: { value: GarmentSide; label: string }[] = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "left_sleeve", label: "Left Sleeve" },
  { value: "right_sleeve", label: "Right Sleeve" },
]

type SideSelectorProps = {
  currentSide: GarmentSide
  onSelectSide: (side: GarmentSide) => void
}

export default function SideSelector({ currentSide, onSelectSide }: SideSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {SIDE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            currentSide === option.value
              ? "bg-ui-fg-base text-ui-bg-base"
              : "bg-ui-bg-subtle text-ui-fg-subtle hover:bg-ui-bg-base"
          }`}
          onClick={() => onSelectSide(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
