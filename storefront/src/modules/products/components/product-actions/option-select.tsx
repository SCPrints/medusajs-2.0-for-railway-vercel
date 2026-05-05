import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import React from "react"

import { useProductOptions } from "@modules/products/context/product-options-context"
import { sortGarmentColorLabels } from "@modules/products/lib/garment-color-order"
import { sortApparelSizeLabels } from "@modules/products/lib/apparel-size-order"
import { getColorSwatchImageMap } from "@modules/products/lib/color-swatch-images"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import { isColorOptionTitle, toTitleSlug } from "@modules/products/lib/variant-options"

type OptionSelectProps = {
  product: HttpTypes.StoreProduct
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  product,
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  const { setColorHoverPreview } = useProductOptions()
  const rawOptionValues = option.values?.map((v) => v.value)
  const isColorOption = isColorOptionTitle(title)
  const isSizeOption = !isColorOption && /size/i.test(title)
  const stringValues = (rawOptionValues ?? []).filter(
    (v): v is string => v != null && v !== ""
  )
  const filteredOptions =
    isSizeOption && stringValues.length
      ? sortApparelSizeLabels([...stringValues])
      : isColorOption && stringValues.length
        ? sortGarmentColorLabels([...stringValues])
        : rawOptionValues
  const colorSwatchImageMap = isColorOption ? getColorSwatchImageMap(product, title) : null

  return (
    <div
      className={clx("flex flex-wrap gap-2 text-small-regular pt-2 pb-1 overflow-visible", {
        "justify-start": isColorOption,
        "justify-between": !isColorOption,
      })}
      data-testid={dataTestId}
      onPointerLeave={
        isColorOption
          ? () => {
              setColorHoverPreview(null)
            }
          : undefined
    }
    >
      {filteredOptions?.map((v) => {
        const isSelected = v === current
        const normalizedValue = toTitleSlug(v ?? "")
        const swatchImage = colorSwatchImageMap?.get(normalizedValue)

        if (isColorOption) {
          return (
            <div key={v} className="group/swatch relative overflow-visible">
              <button
                onPointerEnter={() => {
                  if (v != null && v !== "") {
                    setColorHoverPreview(v)
                  }
                }}
                onClick={() => updateOption(option.title ?? "", v ?? "")}
                data-no-squish
                className={clx(
                  "h-8 w-8 rounded-full border transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-fg-base focus-visible:ring-offset-2",
                  {
                    "border-[var(--brand-accent)] ring-2 ring-[var(--brand-accent)] ring-offset-1":
                      isSelected,
                    "border-ui-border-base hover:scale-105 hover:border-[var(--brand-secondary)] hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-offset-1":
                      !isSelected,
                  }
                )}
                style={{
                  backgroundColor: resolveGarmentSwatchColor(v ?? ""),
                  backgroundImage: swatchImage ? `url("${swatchImage}")` : undefined,
                  backgroundSize: swatchImage ? "235%" : "cover",
                  backgroundPosition: swatchImage ? "center 35%" : "center",
                }}
                disabled={disabled}
                data-testid="option-button"
                aria-label={`Select ${title} ${v}`}
              />
              <span className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-0 z-20 origin-bottom-left whitespace-nowrap rounded-md bg-ui-fg-base px-2 py-1 text-[11px] font-medium text-ui-bg-base opacity-0 shadow-sm transition-all duration-150 ease-out translate-y-1 scale-95 group-hover/swatch:opacity-100 group-hover/swatch:translate-y-0 group-hover/swatch:scale-100 group-focus-within/swatch:opacity-100 group-focus-within/swatch:translate-y-0 group-focus-within/swatch:scale-100">
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
  )
}

export default OptionSelect
