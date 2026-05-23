"use client"

import { HttpTypes } from "@medusajs/types"
import { useMemo, useState } from "react"

import { isColorOptionTitle } from "@modules/products/lib/variant-options"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"

export type InlineCell = {
  variant: HttpTypes.StoreProductVariant
  size: string
  quantity: number
}

type Props = {
  product: HttpTypes.StoreProduct
  cells: InlineCell[]
  onChange: (next: InlineCell[]) => void
  disabled?: boolean
}

/**
 * Compact inline editor for the (variant × quantity) cells that make up
 * a cart-design group. Replaces the wizard's Step 4 quantity grid AND
 * the trip to the bulk-grid overlay when the customer is editing a
 * design already in their cart.
 *
 * Each row = one cart line (variant + size + qty). Customer can:
 *   - tweak qty in place with the stepper
 *   - remove a row entirely (× button)
 *   - add a new variant via the inline "+ Add variant" panel
 *
 * On every change, calls onChange(nextCells). The parent (customizer
 * template in edit-design mode) forwards those cells into
 * addCustomizedToCart on Save — same fan-out path the bulk grid uses,
 * minimal new code on the cart-write side.
 */
export default function CartVariantInlineList({
  product,
  cells,
  onChange,
  disabled = false,
}: Props) {
  const colourOption = useMemo(
    () => product.options?.find((opt) => isColorOptionTitle(opt.title)) ?? null,
    [product]
  )
  const sizeOption = useMemo(
    () =>
      product.options?.find((opt) =>
        (opt.title ?? "").toLowerCase().includes("size")
      ) ?? null,
    [product]
  )

  const variantColour = (variant: HttpTypes.StoreProductVariant) =>
    colourOption
      ? variant.options?.find((o) => o.option_id === colourOption.id)?.value ??
        null
      : null

  const variantSize = (variant: HttpTypes.StoreProductVariant) =>
    sizeOption
      ? variant.options?.find((o) => o.option_id === sizeOption.id)?.value ??
        null
      : null

  const allColours = useMemo<string[]>(() => {
    if (!colourOption) return []
    const set = new Set<string>()
    for (const variant of product.variants ?? []) {
      const colour = variantColour(variant)
      if (colour) set.add(colour)
    }
    return Array.from(set).sort()
  }, [product, colourOption])

  const sizesForColour = (colour: string): string[] => {
    if (!sizeOption) return ["Default"]
    const set = new Set<string>()
    for (const variant of product.variants ?? []) {
      if (variantColour(variant) === colour) {
        const size = variantSize(variant)
        if (size) set.add(size)
      }
    }
    return Array.from(set)
  }

  const findVariant = (
    colour: string,
    size: string
  ): HttpTypes.StoreProductVariant | null => {
    if (!product.variants) return null
    for (const variant of product.variants) {
      if (
        variantColour(variant) === colour &&
        (variantSize(variant) === size || (!sizeOption && size === "Default"))
      ) {
        return variant
      }
    }
    return null
  }

  const totalGarments = cells.reduce((sum, c) => sum + (c.quantity || 0), 0)

  const updateQty = (idx: number, nextQty: number) => {
    const next = cells
      .map((cell, i) => (i === idx ? { ...cell, quantity: Math.max(0, nextQty) } : cell))
      .filter((cell) => cell.quantity > 0)
    onChange(next)
  }

  const removeRow = (idx: number) => {
    onChange(cells.filter((_, i) => i !== idx))
  }

  // Add-variant picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerColour, setPickerColour] = useState<string>("")
  const [pickerSize, setPickerSize] = useState<string>("")
  const [pickerQty, setPickerQty] = useState<number>(1)

  // When opening the picker, default to the first colour not already in cells.
  const openPicker = () => {
    setPickerOpen(true)
    const existingKeys = new Set(
      cells
        .map((cell) => variantColour(cell.variant))
        .filter((c): c is string => !!c)
    )
    const firstUnused = allColours.find((c) => !existingKeys.has(c)) ?? allColours[0] ?? ""
    setPickerColour(firstUnused)
    const sizes = firstUnused ? sizesForColour(firstUnused) : ["Default"]
    setPickerSize(sizes[0] ?? "Default")
    setPickerQty(1)
  }

  const cancelPicker = () => {
    setPickerOpen(false)
    setPickerColour("")
    setPickerSize("")
    setPickerQty(1)
  }

  const confirmPicker = () => {
    if (!pickerColour) return
    const variant = findVariant(pickerColour, pickerSize)
    if (!variant) return
    const sizeKey = pickerSize || "Default"
    // If the (colour, size) already exists in cells, increment that row
    // rather than creating a duplicate.
    const existingIdx = cells.findIndex(
      (c) => c.variant.id === variant.id && c.size === sizeKey
    )
    if (existingIdx >= 0) {
      updateQty(existingIdx, cells[existingIdx].quantity + Math.max(1, pickerQty))
    } else {
      onChange([
        ...cells,
        {
          variant,
          size: sizeKey,
          quantity: Math.max(1, pickerQty),
        },
      ])
    }
    cancelPicker()
  }

  // Available sizes update when colour changes inside the picker.
  const pickerSizes = pickerColour ? sizesForColour(pickerColour) : ["Default"]
  if (pickerColour && pickerSize && !pickerSizes.includes(pickerSize)) {
    // Colour switched and current size doesn't exist for new colour; snap to first.
    setTimeout(() => setPickerSize(pickerSizes[0] ?? "Default"), 0)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ui-fg-base">
          Your cart variants
        </p>
        <p className="text-xs text-ui-fg-subtle">
          {totalGarments} garment{totalGarments === 1 ? "" : "s"} · {cells.length}{" "}
          line{cells.length === 1 ? "" : "s"}
        </p>
      </div>

      {cells.length === 0 ? (
        <p className="rounded-md border border-dashed border-ui-border-base bg-ui-bg-subtle px-3 py-3 text-xs text-ui-fg-subtle">
          No variants in this group yet. Add one below.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {cells.map((cell, idx) => {
            const colour = variantColour(cell.variant)
            const swatch = colour
              ? resolveGarmentSwatchColor(colour)
              : null
            return (
              <li
                key={`${cell.variant.id}::${cell.size}::${idx}`}
                className="flex items-center gap-2 rounded-md border border-ui-border-base bg-ui-bg-base px-2.5 py-1.5"
              >
                {swatch ? (
                  <span
                    className="h-5 w-5 shrink-0 rounded-full ring-1 ring-ui-border-base"
                    style={{ background: swatch }}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="h-5 w-5 shrink-0 rounded-full bg-ui-bg-subtle ring-1 ring-ui-border-base"
                    aria-hidden
                  />
                )}
                <span className="flex-1 truncate text-xs font-medium text-ui-fg-base">
                  {colour ?? "—"}
                  <span className="ml-1 text-ui-fg-subtle">/ {cell.size}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateQty(idx, cell.quantity - 1)}
                    disabled={disabled}
                    className="flex h-7 w-7 items-center justify-center rounded border border-ui-border-base bg-white text-sm font-semibold text-ui-fg-base transition-colors hover:bg-ui-bg-subtle disabled:opacity-40"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={cell.quantity}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (Number.isFinite(next)) updateQty(idx, next)
                    }}
                    disabled={disabled}
                    className="h-7 w-12 rounded border border-ui-border-base bg-white text-center text-xs tabular-nums text-ui-fg-base disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => updateQty(idx, cell.quantity + 1)}
                    disabled={disabled}
                    className="flex h-7 w-7 items-center justify-center rounded border border-ui-border-base bg-white text-sm font-semibold text-ui-fg-base transition-colors hover:bg-ui-bg-subtle disabled:opacity-40"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={disabled}
                  className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ui-fg-muted transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                  aria-label="Remove this variant from the group"
                  title="Remove from group"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {pickerOpen ? (
        <div className="space-y-2 rounded-md border border-ui-border-base bg-ui-bg-subtle p-2.5">
          <p className="text-xs font-semibold text-ui-fg-base">Add a variant</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-ui-fg-subtle">
              Colour
              <select
                value={pickerColour}
                onChange={(e) => {
                  setPickerColour(e.target.value)
                  const sizes = sizesForColour(e.target.value)
                  setPickerSize(sizes[0] ?? "Default")
                }}
                className="rounded border border-ui-border-base bg-white px-2 py-1 text-xs text-ui-fg-base"
              >
                {allColours.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ui-fg-subtle">
              Size
              <select
                value={pickerSize}
                onChange={(e) => setPickerSize(e.target.value)}
                className="rounded border border-ui-border-base bg-white px-2 py-1 text-xs text-ui-fg-base"
              >
                {pickerSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[11px] text-ui-fg-subtle">
              Qty
              <input
                type="number"
                min={1}
                max={9999}
                value={pickerQty}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (Number.isFinite(next)) setPickerQty(Math.max(1, next))
                }}
                className="h-7 w-16 rounded border border-ui-border-base bg-white px-1 text-center text-xs tabular-nums text-ui-fg-base"
              />
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelPicker}
                className="rounded px-2 py-1 text-xs text-ui-fg-subtle hover:text-ui-fg-base"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPicker}
                disabled={disabled || !pickerColour}
                className="rounded-md bg-ui-fg-base px-2.5 py-1 text-xs font-semibold text-white hover:opacity-80 disabled:opacity-40"
              >
                Add to group
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || allColours.length === 0}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-ui-border-base bg-ui-bg-base px-3 py-2 text-xs font-medium text-ui-fg-subtle transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base disabled:opacity-40"
        >
          <span aria-hidden>+</span> Add another variant
        </button>
      )}
    </div>
  )
}
