import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import React from "react"

import { useProductOptions } from "@modules/products/context/product-options-context"
import { sortGarmentColorLabels } from "@modules/products/lib/garment-color-order"
import { sortApparelSizeLabels } from "@modules/products/lib/apparel-size-order"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import {
  findProductOptionByTitle,
  getGarmentSwatchImageUrlFromMetadata,
  getVariantOptionValue,
  toTitleSlug,
} from "@modules/products/lib/variant-options"

type OptionSelectProps = {
  product: HttpTypes.StoreProduct
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  showSizeQuantityInputs?: boolean
  "data-testid"?: string
}

/** Match option titles used for garment colours (incl. “Shade”). */
const COLOR_OPTION_MATCHER = /(color|colour|shade)/i

const getColorSwatchImageMap = (
  product: HttpTypes.StoreProduct,
  optionTitle: string
) => {
  const swatchImageMap = new Map<string, string>()
  const optionDef = findProductOptionByTitle(product, optionTitle)
  if (!optionDef) {
    return swatchImageMap
  }

  const byColorKey = new Map<string, HttpTypes.StoreProductVariant[]>()

  for (const variant of product.variants ?? []) {
    const colorValue = getVariantOptionValue(variant, optionTitle)
    if (!colorValue) {
      continue
    }
    const key = toTitleSlug(colorValue)
    const list = byColorKey.get(key) ?? []
    list.push(variant)
    byColorKey.set(key, list)
  }

  for (const [key, variants] of Array.from(byColorKey.entries())) {
    const urls = variants
      .map((v: HttpTypes.StoreProductVariant) =>
        getGarmentSwatchImageUrlFromMetadata(((v as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>)
      )
      .filter((url: string | undefined): url is string => typeof url === "string" && url.length > 0)

    if (urls.length) {
      swatchImageMap.set(key, urls[0])
    }
  }

  for (const optionValue of optionDef.values ?? []) {
    const rawValue = optionValue.value ?? ""
    const key = toTitleSlug(rawValue)

    if (!key || swatchImageMap.has(key)) {
      continue
    }

    const tokens = key.split(" ").filter(Boolean)
    const matchedImage = (product.images ?? [])
      .map((image) => image.url)
      .find((url) => {
        if (!url) {
          return false
        }

        const normalizedUrl = toTitleSlug(url)
        return (
          normalizedUrl.includes(key) ||
          normalizedUrl.includes(key.replace(/\s+/g, "")) ||
          tokens.some((token) => normalizedUrl.includes(token))
        )
      })

    if (matchedImage) {
      swatchImageMap.set(key, matchedImage)
    }
  }

  return swatchImageMap
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  product,
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
  showSizeQuantityInputs = true,
}) => {
  const { sizeQuantities, setSizeQuantity } = useProductOptions()
  const rawOptionValues = option.values?.map((v) => v.value)
  const isColorOption = COLOR_OPTION_MATCHER.test(title)
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

  if (isSizeOption && showSizeQuantityInputs && filteredOptions?.length) {
    return (
      <div className="flex flex-col gap-2 pt-2 pb-1 text-small-regular" data-testid={dataTestId}>
        <p className="text-xs text-ui-fg-subtle">
          Set quantity per size for this colour. The preview follows the size you last changed.
        </p>
        <div className="flex flex-col gap-2">
          {filteredOptions.map((v) => {
            if (v == null) {
              return null
            }
            const qty = sizeQuantities[v] ?? 0
            return (
              <div
                key={v}
                className="flex flex-wrap items-center gap-2 rounded-md border border-ui-border-base bg-ui-bg-subtle px-2 py-1.5"
              >
                <span className="min-w-[2.5rem] shrink-0 text-sm font-medium text-ui-fg-base">
                  {v}
                </span>
                <label className="ml-auto flex items-center gap-1.5 text-xs text-ui-fg-subtle">
                  <span className="sr-only">Quantity for size {v}</span>
                  <span aria-hidden>Qty</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={qty}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setSizeQuantity(v, next)
                      updateOption(title, v)
                    }}
                    disabled={disabled}
                    className="w-16 rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 text-sm tabular-nums"
                    data-testid="size-qty-input"
                  />
                </label>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      className={clx("flex flex-wrap gap-2 text-small-regular pt-2 pb-1", {
        "justify-start": isColorOption,
        "justify-between": !isColorOption,
      })}
      data-testid={dataTestId}
    >
      {filteredOptions?.map((v) => {
        const isSelected = v === current
        const normalizedValue = toTitleSlug(v ?? "")
        const swatchImage = colorSwatchImageMap?.get(normalizedValue)

        if (isColorOption) {
          return (
            <div key={v} className="group/swatch relative">
              <button
                onClick={() => updateOption(option.title ?? "", v ?? "")}
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
              <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ui-fg-base px-2 py-1 text-[11px] font-medium text-ui-bg-base opacity-0 shadow-sm transition-opacity duration-150 group-hover/swatch:opacity-100 group-focus-within/swatch:opacity-100">
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
