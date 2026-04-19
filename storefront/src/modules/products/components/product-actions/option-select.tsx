import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import React from "react"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
}

const COLOR_OPTION_MATCHER = /(color|colour)/i

const COLOR_SWATCHES: Record<string, string> = {
  black: "#111827",
  white: "#f9fafb",
  navy: "#1e3a8a",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#15803d",
  yellow: "#facc15",
  orange: "#f97316",
  purple: "#7c3aed",
  pink: "#ec4899",
  grey: "#6b7280",
  gray: "#6b7280",
  charcoal: "#374151",
  cream: "#fef3c7",
  maroon: "#7f1d1d",
  ecru: "#ede3cf",
  stone: "#d6d3d1",
  natural: "#f5f5dc",
  brown: "#7c5a3b",
  khaki: "#8a7f52",
  walnut: "#6b4f3a",
  mushroom: "#a1907f",
  forest: "#2f5d50",
  olive: "#556b2f",
  sage: "#9caf88",
  sand: "#d8c8a8",
  beige: "#d6c2a4",
  tan: "#b58d66",
  camel: "#b08457",
  gold: "#c9a227",
  silver: "#c0c0c0",
  chocolate: "#5c4033",
  coffee: "#6f4e37",
  burgundy: "#800020",
  wine: "#722f37",
  rust: "#b7410e",
  charcoalmarl: "#5b6268",
  marle: "#a8a9ad",
  heather: "#9ea3a8",
  asphalt: "#4b5563",
  smoke: "#7b8794",
  shadow: "#6b7280",
  storm: "#7a838f",
  lilac: "#c8a2c8",
  lavender: "#b7a3d0",
  orchid: "#b565d9",
  mint: "#98d8c8",
  teal: "#0f766e",
  sky: "#7ec8e3",
  royal: "#4169e1",
  cobalt: "#0047ab",
  indigo: "#3f51b5",
  denim: "#4f6d8a",
  butter: "#f4e08d",
  bone: "#e8dfd0",
  natural: "#f5f5dc",
  walnutbrown: "#6b4f3a",
}

const toTitleSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const hashToHsl = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 40% 62%)`
}

const swatchColor = (colorValue: string) => {
  const normalized = toTitleSlug(colorValue)
  if (!normalized) {
    return "#d1d5db"
  }

  const compact = normalized.replace(/\s+/g, "")
  const tokens = normalized.split(" ")

  const matched =
    COLOR_SWATCHES[normalized] ??
    COLOR_SWATCHES[compact] ??
    tokens.map((token) => COLOR_SWATCHES[token]).find(Boolean)

  // Always return a visible color, even for unseen color labels.
  return matched ?? hashToHsl(normalized)
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  const filteredOptions = option.values?.map((v) => v.value)
  const isColorOption = COLOR_OPTION_MATCHER.test(title)

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm">Select {title}</span>
      <div
        className={clx("flex flex-wrap gap-2", {
          "justify-start": isColorOption,
          "justify-between": !isColorOption,
        })}
        data-testid={dataTestId}
      >
        {filteredOptions?.map((v) => {
          const isSelected = v === current

          if (isColorOption) {
            return (
              <div key={v} className="group relative">
                <button
                  onClick={() => updateOption(option.title ?? "", v ?? "")}
                  className={clx(
                    "h-8 w-8 rounded-full border transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-fg-base focus-visible:ring-offset-2",
                    {
                      "border-ui-fg-base ring-2 ring-ui-fg-base ring-offset-1": isSelected,
                      "border-ui-border-base hover:scale-105": !isSelected,
                    }
                  )}
                  style={{ backgroundColor: swatchColor(v ?? "") }}
                  disabled={disabled}
                  data-testid="option-button"
                  aria-label={`Select ${title} ${v}`}
                />
                <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ui-fg-base px-2 py-1 text-[11px] font-medium text-ui-bg-base opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                  {v}
                </span>
              </div>
            )
          }

          return (
            <button
              onClick={() => updateOption(option.title ?? "", v ?? "")}
              key={v}
              className={clx(
                "border-ui-border-base bg-ui-bg-subtle border text-small-regular h-10 rounded-rounded p-2 flex-1 ",
                {
                  "border-ui-border-interactive": isSelected,
                  "hover:shadow-elevation-card-rest transition-shadow ease-in-out duration-150":
                    !isSelected,
                }
              )}
              disabled={disabled}
              data-testid="option-button"
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect
