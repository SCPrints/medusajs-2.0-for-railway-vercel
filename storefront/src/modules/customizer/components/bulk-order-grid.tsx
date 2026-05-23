"use client"

import { HttpTypes } from "@medusajs/types"
import { useEffect, useMemo, useRef, useState } from "react"

import { convertToLocale } from "@lib/util/money"
import { phCapture } from "@lib/posthog"
import {
  getGarmentImageUrlForPrintSide,
  isColorOptionTitle,
} from "@modules/products/lib/variant-options"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import type { GarmentSide } from "@modules/customizer/lib/types"

export type BulkCellEntry = {
  variant: HttpTypes.StoreProductVariant
  size: string
  quantity: number
  /** Per-colour composited mockup data URL — front-side only, generated at submit time. */
  mockupDataUrl?: string
}

export type BulkPricingEstimate = {
  unitPriceMajor: number
  totalPriceMajor: number
  activeTierLabel?: string
}

type SizeOption = { id: string; title: string }
type ColourOption = { id: string; title: string }

export type BulkOrderGridProps = {
  product: HttpTypes.StoreProduct
  baseVariant: HttpTypes.StoreProductVariant
  defaultGarmentImage: string | null
  currencyCode: string
  isSubmitting: boolean
  /**
   * Print artifact for the side we use to build per-colour cart thumbnails.
   * Typically the first decorated side (front, falling back to whichever the
   * customer designed). Null when there's no print artifact yet — the grid
   * still works, lines just don't get per-colour mockups.
   */
  printThumbSource: { side: GarmentSide; printUrl: string } | null
  /**
   * Given a total quantity across all picked cells, return the projected
   * per-garment + per-line totals the customer would see if they checked out
   * with that total. Parent owns pricing — this keeps tier math consistent
   * with the wizard's existing breakdown.
   */
  estimatePricingForTotal: (totalQty: number) => BulkPricingEstimate | null
  onClose: () => void
  /** Exit the customizer entirely — drops the customer back at the PDP gallery. */
  onBackToProduct?: () => void
  onSubmit: (cells: BulkCellEntry[]) => Promise<void>
  /**
   * Phase 2 group-edit: pre-populate the picked colours + quantities from
   * an existing cart group so the customer lands inside the grid with
   * their current selection rather than the default single-row base
   * variant. When set, the grid seeds state from these cells on mount.
   */
  initialCells?: Array<{
    variant: HttpTypes.StoreProductVariant
    size: string
    quantity: number
  }>
  /** Override the primary submit-button label. Defaults to "Add N items to cart". */
  submitCtaLabel?: string
  /**
   * Group-edit mode — when true, the grid reframes its language and
   * visuals to say "you're editing" rather than "you're adding". The
   * customer sees an amber banner, the header reads "Edit design", the
   * Back button reads "Back to cart", and the submit copy emphasises
   * UPDATE not ADD.
   */
  editMode?: boolean
  /** Count of cart lines being edited (display only). */
  editingLineCount?: number
  /** Total quantity of garments being edited (display only). */
  editingTotalQuantity?: number
}

// Canonical clothing-size rank. Anything that doesn't match a known label
// falls back to numeric (kids age sizes, EU sizes) or alphabetic sort.
// Covers AS Colour (XSM/SML/MED/LRG/XLG), Aussie Pacific (XS/S/M/L/XL/2XL+),
// FashionBiz, and most workwear naming we'll see.
const SIZE_RANK: Record<string, number> = {
  XXXS: -3, "3XS": -3,
  XXS: -2, "2XS": -2,
  XS: -1, XSM: -1,
  S: 0, SM: 0, SML: 0, SMALL: 0,
  M: 1, MD: 1, MED: 1, MEDIUM: 1,
  L: 2, LG: 2, LRG: 2, LARGE: 2,
  XL: 3, XLG: 3,
  XXL: 4, "2XL": 4,
  XXXL: 5, "3XL": 5,
  XXXXL: 6, "4XL": 6,
  "5XL": 7,
  "6XL": 8,
  "7XL": 9,
}

const sizeRank = (size: string): number => {
  const key = size.trim().toUpperCase()
  if (key in SIZE_RANK) return SIZE_RANK[key]
  // nXL / nXXL etc.
  const upper = key.match(/^(\d+)X+L$/)
  if (upper) return 3 + Number(upper[1])
  // nXS / nXXS etc.
  const lower = key.match(/^(\d+)X+S$/)
  if (lower) return -Number(lower[1])
  // Numeric sizes (kids' age, EU). Push past the XL range so they sort
  // predictably amongst themselves.
  const numeric = parseFloat(key)
  if (Number.isFinite(numeric)) return 100 + numeric
  return 1000
}

export const compareSizes = (a: string, b: string): number => {
  const ra = sizeRank(a)
  const rb = sizeRank(b)
  if (ra !== rb) return ra - rb
  return a.localeCompare(b, undefined, { numeric: true })
}

export default function BulkOrderGrid({
  product,
  baseVariant,
  defaultGarmentImage,
  currencyCode,
  isSubmitting,
  printThumbSource,
  estimatePricingForTotal,
  onClose,
  onBackToProduct,
  onSubmit,
  initialCells,
  submitCtaLabel,
  editMode = false,
  editingLineCount = 0,
  editingTotalQuantity = 0,
}: BulkOrderGridProps) {
  const sizeOption = useMemo<SizeOption | null>(() => {
    const option = product.options?.find((entry) =>
      (entry.title ?? "").toLowerCase().includes("size")
    )
    return option ? { id: option.id, title: option.title ?? "Size" } : null
  }, [product])

  const colourOption = useMemo<ColourOption | null>(() => {
    const option = product.options?.find((entry) => isColorOptionTitle(entry.title))
    return option ? { id: option.id, title: option.title ?? "Colour" } : null
  }, [product])

  const colourValues = useMemo<string[]>(() => {
    if (!colourOption) return []
    const set = new Set<string>()
    for (const variant of product.variants ?? []) {
      const value = variant.options?.find((entry) => entry.option_id === colourOption.id)?.value
      if (value) set.add(value)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [product, colourOption])

  const sizeValues = useMemo<string[]>(() => {
    if (!sizeOption) return []
    const set = new Set<string>()
    for (const variant of product.variants ?? []) {
      const value = variant.options?.find((entry) => entry.option_id === sizeOption.id)?.value
      if (value) set.add(value)
    }
    return Array.from(set).sort(compareSizes)
  }, [product, sizeOption])

  // Variant lookup: (colourValue, sizeValue) → variant. Used by both the grid
  // input cells and the add-to-cart submitter.
  const variantByColourSize = useMemo(() => {
    const map = new Map<string, HttpTypes.StoreProductVariant>()
    if (!colourOption || !sizeOption) return map
    for (const variant of product.variants ?? []) {
      const colour = variant.options?.find((entry) => entry.option_id === colourOption.id)?.value
      const size = variant.options?.find((entry) => entry.option_id === sizeOption.id)?.value
      if (colour && size) {
        map.set(`${colour}::${size}`, variant)
      }
    }
    return map
  }, [product, colourOption, sizeOption])

  const baseVariantColour = useMemo(() => {
    if (!colourOption) return null
    return (
      baseVariant.options?.find((entry) => entry.option_id === colourOption.id)?.value ?? null
    )
  }, [baseVariant, colourOption])

  // Picked colour list. The colour the customer just designed against is
  // pre-added so they always have one row to start from. In group-edit
  // mode (initialCells supplied) the picked colours and quantities are
  // seeded from the existing cart group so the customer can edit those
  // cells, add new colours, or remove rows without re-entering data.
  const seedFromInitialCells = useMemo(() => {
    if (!initialCells?.length || !colourOption) return null
    const colours = new Set<string>()
    const qty: Record<string, number> = {}
    for (const cell of initialCells) {
      const colour =
        cell.variant.options?.find(
          (entry) => entry.option_id === colourOption.id
        )?.value ?? null
      if (!colour) continue
      colours.add(colour)
      const key = `${colour}::${cell.size}`
      qty[key] = (qty[key] ?? 0) + (cell.quantity ?? 0)
    }
    if (colours.size === 0) return null
    return {
      colours: Array.from(colours),
      quantities: qty,
    }
    // initialCells is only read once on first render — subsequent edits
    // come from user input. Re-seeding on prop changes would wipe their
    // in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [pickedColours, setPickedColours] = useState<string[]>(() =>
    seedFromInitialCells?.colours.length
      ? seedFromInitialCells.colours
      : baseVariantColour
        ? [baseVariantColour]
        : []
  )
  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => seedFromInitialCells?.quantities ?? {}
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0),
    [quantities]
  )

  const colourQuantity = (colour: string) => {
    if (!sizeValues.length) return quantities[`${colour}::Default`] ?? 0
    return sizeValues.reduce((sum, size) => sum + (quantities[`${colour}::${size}`] ?? 0), 0)
  }

  const filteredColourValues = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase()
    if (!term) return colourValues
    return colourValues.filter((value) => value.toLowerCase().includes(term))
  }, [colourValues, pickerSearch])

  const addColour = (colour: string) => {
    setPickedColours((prev) => (prev.includes(colour) ? prev : [...prev, colour]))
    phCapture("bulk_colour_added", { product_id: product.id, colour_value: colour })
  }

  const removeColour = (colour: string) => {
    setPickedColours((prev) => prev.filter((entry) => entry !== colour))
    setQuantities((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${colour}::`)) {
          delete next[key]
        }
      }
      return next
    })
  }

  const setCellQuantity = (colour: string, size: string, value: number) => {
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(999, Math.floor(value))) : 0
    setQuantities((prev) => ({ ...prev, [`${colour}::${size}`]: clamped }))
  }

  const pricingEstimate = estimatePricingForTotal(totalQuantity)

  const handleSubmit = async () => {
    if (totalQuantity === 0) {
      setSubmitError("Enter at least one quantity before adding to cart.")
      return
    }
    setSubmitError(null)

    // Build the cell list. One entry per (colour, size) with quantity > 0.
    const cellsToAdd: BulkCellEntry[] = []
    for (const colour of pickedColours) {
      const sizes = sizeValues.length ? sizeValues : ["Default"]
      for (const size of sizes) {
        const qty = quantities[`${colour}::${size}`] ?? 0
        if (qty <= 0) continue
        const variant = variantByColourSize.get(`${colour}::${size}`)
        if (!variant) continue
        cellsToAdd.push({ variant, size, quantity: qty })
      }
    }
    if (!cellsToAdd.length) {
      setSubmitError("Pick at least one in-stock size/colour combination.")
      return
    }

    // Compose per-colour mockup thumbnails in parallel so cart line items
    // carry the colour the customer actually picked, not the design-reference
    // colour. Compositing failures are non-fatal — the line still goes in,
    // just without an updated thumb.
    if (printThumbSource) {
      const colourToMockup = new Map<string, string>()
      const distinctColours = Array.from(new Set(cellsToAdd.map((cell) => {
        const value = cell.variant.options?.find((entry) => entry.option_id === colourOption?.id)?.value
        return value ?? ""
      })))
      await Promise.all(
        distinctColours.filter(Boolean).map(async (colour) => {
          const variant = cellsToAdd.find((cell) => {
            const value = cell.variant.options?.find((entry) => entry.option_id === colourOption?.id)?.value
            return value === colour
          })?.variant
          if (!variant) return
          const garmentUrl = getGarmentImageUrlForPrintSide(
            product,
            variant,
            printThumbSource.side,
            defaultGarmentImage
          )
          if (!garmentUrl) return
          try {
            const dataUrl = await composeColourMockup({
              garmentImageUrl: garmentUrl,
              printPngUrl: printThumbSource.printUrl,
            })
            if (dataUrl) colourToMockup.set(colour, dataUrl)
          } catch {
            // swallow — fall back to the base mockup the parent already has
          }
        })
      )
      for (const cell of cellsToAdd) {
        const colour = cell.variant.options?.find((entry) => entry.option_id === colourOption?.id)?.value
        if (colour && colourToMockup.has(colour)) {
          cell.mockupDataUrl = colourToMockup.get(colour)
        }
      }
    }

    try {
      await onSubmit(cellsToAdd)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not add the bulk order to cart."
      )
    }
  }

  // Track grid open once per mount so funnel reports count attempts, not
  // re-renders.
  const fireOpenedRef = useRef(false)
  useEffect(() => {
    if (fireOpenedRef.current) return
    fireOpenedRef.current = true
    phCapture("bulk_grid_opened", { product_id: product.id })
  }, [product.id])

  if (!colourOption || !sizeOption) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-ui-fg-subtle">
          This product doesn't have separate colour + size options, so bulk ordering
          isn't available — use the regular size matrix in Step 4.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-ui-fg-base px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
        >
          Back to design
        </button>
      </div>
    )
  }

  const isAddDisabled = totalQuantity === 0 || isSubmitting

  return (
    <div
      className={`flex h-full flex-col ${
        editMode ? "bg-amber-50/50" : "bg-ui-bg-subtle/30"
      }`}
    >
      {editMode ? (
        <div className="border-b-2 border-amber-400 bg-amber-100 px-4 py-2.5 sm:px-6">
          <p className="text-sm font-semibold text-amber-900">
            ✏️ Editing your cart design
          </p>
          <p className="text-xs text-amber-800">
            You're updating the artwork + variant mix on{" "}
            <span className="font-semibold">
              {editingLineCount > 0
                ? `${editingLineCount} cart line${editingLineCount === 1 ? "" : "s"}`
                : "your existing cart"}
            </span>
            {editingTotalQuantity > 0
              ? ` (${editingTotalQuantity} garments)`
              : ""}
            . No new items will be added — your existing cart will be
            replaced when you save.
          </p>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ui-border-base bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-md border border-ui-border-base bg-white px-3 py-1.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle disabled:opacity-50"
          >
            <span aria-hidden>←</span>{" "}
            {editMode ? "Cancel & back to cart" : "Back to design"}
          </button>
          {onBackToProduct && !editMode ? (
            <button
              type="button"
              onClick={onBackToProduct}
              disabled={isSubmitting}
              className="hidden text-xs font-medium text-ui-fg-subtle underline-offset-2 transition-colors hover:text-ui-fg-base hover:underline disabled:opacity-50 sm:inline"
            >
              Exit to product page
            </button>
          ) : null}
          <div className="hidden lg:block">
            <p className="text-base font-semibold text-ui-fg-base">
              {editMode ? "Edit design" : "Bulk order grid"}
            </p>
            <p className="text-xs text-ui-fg-subtle">
              {editMode
                ? "Adjust artwork, add or remove colours, then save to update your cart."
                : "Same design applied across every colour and size you pick."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pricingEstimate ? (
            <div className="hidden text-right sm:block">
              <p className="text-[11px] uppercase tracking-wide text-ui-fg-subtle">
                {totalQuantity} {totalQuantity === 1 ? "item" : "items"}
                {pricingEstimate.activeTierLabel ? ` · ${pricingEstimate.activeTierLabel}` : ""}
              </p>
              <p className="text-lg font-semibold tabular-nums text-ui-fg-base">
                {convertToLocale({
                  amount: pricingEstimate.totalPriceMajor,
                  currency_code: currencyCode,
                })}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isAddDisabled}
            className="rounded-md bg-ui-fg-base px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? submitCtaLabel
                ? `${submitCtaLabel}…`
                : "Adding…"
              : submitCtaLabel
                ? submitCtaLabel
                : totalQuantity === 0
                  ? "Add to cart"
                  : `Add ${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} to cart`}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        {submitError ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {submitError}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ui-border-base bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ui-fg-base">
              {pickedColours.length} {pickedColours.length === 1 ? "colour" : "colours"} picked
            </p>
            <p className="text-xs text-ui-fg-subtle">
              Bulk discounts apply across the total of every colour + size.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-md border border-ui-fg-base bg-white px-3 py-2 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
          >
            + Add colours
          </button>
        </div>

        {/* Desktop grid */}
        <div className="hidden overflow-hidden rounded-lg border border-ui-border-base bg-white shadow-sm md:block">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle/60 text-[11px] uppercase tracking-wide text-ui-fg-subtle">
              <tr>
                <th scope="col" className="w-[260px] px-4 py-3 text-left font-medium">
                  Colour
                </th>
                {sizeValues.map((size) => (
                  <th
                    key={size}
                    scope="col"
                    className="px-2 py-3 text-center font-medium"
                  >
                    {size}
                  </th>
                ))}
                <th scope="col" className="w-[88px] px-4 py-3 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="w-[44px] px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              {pickedColours.map((colour) => (
                <ColourRow
                  key={colour}
                  product={product}
                  colour={colour}
                  colourOptionId={colourOption.id}
                  sizeOptionId={sizeOption.id}
                  sizeValues={sizeValues}
                  defaultGarmentImage={defaultGarmentImage}
                  quantities={quantities}
                  rowTotal={colourQuantity(colour)}
                  variantByColourSize={variantByColourSize}
                  onChangeQuantity={(size, value) => setCellQuantity(colour, size, value)}
                  onRemove={() => removeColour(colour)}
                  canRemove={pickedColours.length > 1}
                />
              ))}
              {!pickedColours.length ? (
                <tr>
                  <td
                    colSpan={sizeValues.length + 3}
                    className="px-4 py-12 text-center text-sm text-ui-fg-subtle"
                  >
                    Pick a colour above to start filling sizes.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {pickedColours.length ? (
              <tfoot className="bg-ui-bg-subtle/60 text-sm font-medium text-ui-fg-base">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  {sizeValues.map((size) => {
                    const colTotal = pickedColours.reduce(
                      (sum, colour) => sum + (quantities[`${colour}::${size}`] ?? 0),
                      0
                    )
                    return (
                      <td key={size} className="px-2 py-3 text-center tabular-nums">
                        {colTotal || ""}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right tabular-nums">{totalQuantity}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {pickedColours.map((colour) => (
            <MobileColourCard
              key={colour}
              product={product}
              colour={colour}
              colourOptionId={colourOption.id}
              sizeOptionId={sizeOption.id}
              sizeValues={sizeValues}
              defaultGarmentImage={defaultGarmentImage}
              quantities={quantities}
              rowTotal={colourQuantity(colour)}
              variantByColourSize={variantByColourSize}
              onChangeQuantity={(size, value) => setCellQuantity(colour, size, value)}
              onRemove={() => removeColour(colour)}
              canRemove={pickedColours.length > 1}
            />
          ))}
          {!pickedColours.length ? (
            <div className="rounded-lg border border-dashed border-ui-border-base bg-white px-4 py-12 text-center text-sm text-ui-fg-subtle">
              Tap "Add colours" above to start.
            </div>
          ) : null}
        </div>

        {pricingEstimate && totalQuantity > 0 ? (
          <div className="mt-4 rounded-lg border border-ui-border-base bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="font-medium text-ui-fg-base">
                  {totalQuantity} {totalQuantity === 1 ? "item" : "items"} · projected total
                </p>
                {pricingEstimate.activeTierLabel ? (
                  <p className="text-xs text-ui-fg-subtle">
                    {pricingEstimate.activeTierLabel} pricing band
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs text-ui-fg-subtle">
                  {convertToLocale({
                    amount: pricingEstimate.unitPriceMajor,
                    currency_code: currencyCode,
                  })}{" "}
                  / garment
                </p>
                <p className="text-lg font-semibold tabular-nums text-ui-fg-base">
                  {convertToLocale({
                    amount: pricingEstimate.totalPriceMajor,
                    currency_code: currencyCode,
                  })}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {pickerOpen ? (
        <ColourPicker
          product={product}
          colourValues={filteredColourValues}
          pickedColours={pickedColours}
          searchTerm={pickerSearch}
          onSearchChange={setPickerSearch}
          onAdd={(colour) => {
            addColour(colour)
          }}
          onRemove={(colour) => {
            if (pickedColours.length > 1) removeColour(colour)
          }}
          onClose={() => {
            setPickerOpen(false)
            setPickerSearch("")
          }}
          colourOptionId={colourOption.id}
          defaultGarmentImage={defaultGarmentImage}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type RowProps = {
  product: HttpTypes.StoreProduct
  colour: string
  colourOptionId: string
  sizeOptionId: string
  sizeValues: string[]
  defaultGarmentImage: string | null
  quantities: Record<string, number>
  rowTotal: number
  variantByColourSize: Map<string, HttpTypes.StoreProductVariant>
  onChangeQuantity: (size: string, value: number) => void
  onRemove: () => void
  canRemove: boolean
}

function ColourRow({
  product,
  colour,
  colourOptionId,
  sizeValues,
  defaultGarmentImage,
  quantities,
  rowTotal,
  variantByColourSize,
  onChangeQuantity,
  onRemove,
  canRemove,
}: RowProps) {
  const swatchHex = resolveGarmentSwatchColor(colour)
  const variantForThumb = useMemo(
    () =>
      (product.variants ?? []).find(
        (variant) =>
          variant.options?.find((entry) => entry.option_id === colourOptionId)?.value === colour
      ),
    [product, colourOptionId, colour]
  )
  const thumbUrl = useMemo(
    () =>
      getGarmentImageUrlForPrintSide(product, variantForThumb, "front", defaultGarmentImage),
    [product, variantForThumb, defaultGarmentImage]
  )

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={colour}
              className="h-12 w-12 shrink-0 rounded-md border border-ui-border-base object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="h-12 w-12 shrink-0 rounded-md border border-ui-border-base"
              style={{ backgroundColor: swatchHex }}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ui-fg-base">{colour}</p>
            <p className="text-[11px] text-ui-fg-subtle">{variantForThumb?.sku ?? ""}</p>
          </div>
        </div>
      </td>
      {sizeValues.map((size) => {
        const key = `${colour}::${size}`
        const value = quantities[key] ?? 0
        const variant = variantByColourSize.get(key)
        const disabled = !variant
        return (
          <td key={size} className="px-2 py-3 text-center">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              disabled={disabled}
              value={value === 0 ? "" : value}
              placeholder={disabled ? "—" : "0"}
              onChange={(e) => {
                const next = e.target.value === "" ? 0 : Number(e.target.value)
                onChangeQuantity(size, next)
              }}
              className="h-9 w-14 rounded-md border border-ui-border-base bg-white px-2 text-center text-sm tabular-nums focus:border-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-fg-base disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-muted"
              aria-label={`${colour} size ${size} quantity`}
            />
          </td>
        )
      })}
      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-ui-fg-base">
        {rowTotal || ""}
      </td>
      <td className="px-2 py-3 text-right">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded-md p-1 text-ui-fg-muted transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Remove ${colour}`}
          title={canRemove ? `Remove ${colour}` : "Keep at least one colour"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </td>
    </tr>
  )
}

function MobileColourCard({
  product,
  colour,
  colourOptionId,
  sizeValues,
  defaultGarmentImage,
  quantities,
  rowTotal,
  variantByColourSize,
  onChangeQuantity,
  onRemove,
  canRemove,
}: RowProps) {
  const swatchHex = resolveGarmentSwatchColor(colour)
  const variantForThumb = useMemo(
    () =>
      (product.variants ?? []).find(
        (variant) =>
          variant.options?.find((entry) => entry.option_id === colourOptionId)?.value === colour
      ),
    [product, colourOptionId, colour]
  )
  const thumbUrl = useMemo(
    () =>
      getGarmentImageUrlForPrintSide(product, variantForThumb, "front", defaultGarmentImage),
    [product, variantForThumb, defaultGarmentImage]
  )

  return (
    <div className="rounded-lg border border-ui-border-base bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={colour}
              className="h-12 w-12 shrink-0 rounded-md border border-ui-border-base object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="h-12 w-12 shrink-0 rounded-md border border-ui-border-base"
              style={{ backgroundColor: swatchHex }}
            />
          )}
          <div>
            <p className="text-sm font-medium text-ui-fg-base">{colour}</p>
            <p className="text-xs text-ui-fg-subtle">Total: {rowTotal}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded-md p-1 text-ui-fg-muted transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Remove ${colour}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {sizeValues.map((size) => {
          const key = `${colour}::${size}`
          const value = quantities[key] ?? 0
          const variant = variantByColourSize.get(key)
          const disabled = !variant
          return (
            <label key={size} className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ui-fg-subtle">
                {size}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                disabled={disabled}
                value={value === 0 ? "" : value}
                placeholder={disabled ? "—" : "0"}
                onChange={(e) => {
                  const next = e.target.value === "" ? 0 : Number(e.target.value)
                  onChangeQuantity(size, next)
                }}
                className="h-10 w-full rounded-md border border-ui-border-base bg-white px-2 text-center text-sm tabular-nums focus:border-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-fg-base disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-muted"
                aria-label={`${colour} size ${size} quantity`}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}

type ColourPickerProps = {
  product: HttpTypes.StoreProduct
  colourValues: string[]
  pickedColours: string[]
  searchTerm: string
  onSearchChange: (next: string) => void
  onAdd: (colour: string) => void
  onRemove: (colour: string) => void
  onClose: () => void
  colourOptionId: string
  defaultGarmentImage: string | null
}

function ColourPicker({
  product,
  colourValues,
  pickedColours,
  searchTerm,
  onSearchChange,
  onAdd,
  onRemove,
  onClose,
  colourOptionId,
  defaultGarmentImage,
}: ColourPickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl sm:h-[70vh] sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-ui-border-base px-4 py-3">
          <div>
            <p className="text-base font-semibold text-ui-fg-base">Add colours</p>
            <p className="text-xs text-ui-fg-subtle">Tap to add or remove from your bulk order.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close colour picker"
            className="rounded-md p-1 text-ui-fg-muted transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="border-b border-ui-border-base px-4 py-3">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search colours…"
            className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base focus:border-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-fg-base"
          />
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {colourValues.map((colour) => {
              const picked = pickedColours.includes(colour)
              const variant = (product.variants ?? []).find(
                (v) => v.options?.find((entry) => entry.option_id === colourOptionId)?.value === colour
              )
              const thumbUrl = getGarmentImageUrlForPrintSide(
                product,
                variant,
                "front",
                defaultGarmentImage
              )
              const swatch = resolveGarmentSwatchColor(colour)
              return (
                <button
                  key={colour}
                  type="button"
                  onClick={() => (picked ? onRemove(colour) : onAdd(colour))}
                  className={`flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                    picked
                      ? "border-ui-fg-base bg-ui-bg-subtle"
                      : "border-ui-border-base bg-white hover:bg-ui-bg-subtle"
                  }`}
                >
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt={colour}
                      className="h-10 w-10 shrink-0 rounded border border-ui-border-base object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="h-10 w-10 shrink-0 rounded border border-ui-border-base"
                      style={{ backgroundColor: swatch }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ui-fg-base">{colour}</p>
                  </div>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                      picked
                        ? "border-ui-fg-base bg-ui-fg-base text-white"
                        : "border-ui-border-base text-ui-fg-muted"
                    }`}
                    aria-hidden
                  >
                    {picked ? "✓" : "+"}
                  </span>
                </button>
              )
            })}
            {!colourValues.length ? (
              <p className="col-span-full p-6 text-center text-sm text-ui-fg-subtle">
                No colours match "{searchTerm}".
              </p>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-ui-border-base px-4 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-ui-fg-base px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
          >
            Done · {pickedColours.length} picked
          </button>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-colour mockup compositor (client-side, no Fabric.js needed)
//
// The print PNG was already rendered server-side as a transparent full-canvas
// raster — we just draw it on top of the colour-specific garment image. Two
// drawImage calls + a JPEG encode. About 50-100ms per colour on modern
// hardware, runs in parallel via Promise.all.
// ---------------------------------------------------------------------------

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
  })

async function composeColourMockup(input: {
  garmentImageUrl: string
  printPngUrl: string
}): Promise<string | null> {
  const [garment, print] = await Promise.all([
    loadImage(input.garmentImageUrl),
    loadImage(input.printPngUrl),
  ])

  // Match the print PNG's native dimensions so coordinates line up byte-for-byte
  // with the server-side composition the existing mockupUrl already uses.
  const targetW = print.naturalWidth || 600
  const targetH = print.naturalHeight || 750

  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Background fill so any transparent corners of the garment image render as
  // light neutral instead of bleeding the page background through.
  ctx.fillStyle = "#f3f4f6"
  ctx.fillRect(0, 0, targetW, targetH)

  // object-cover: scale the garment so it fills the canvas and centre-crop the
  // overflow. Mirrors the backend's garmentCoverMatchCanvas helper.
  const garmentRatio = garment.naturalWidth / garment.naturalHeight
  const targetRatio = targetW / targetH
  let drawW: number
  let drawH: number
  if (garmentRatio > targetRatio) {
    drawH = targetH
    drawW = drawH * garmentRatio
  } else {
    drawW = targetW
    drawH = drawW / garmentRatio
  }
  const offsetX = (targetW - drawW) / 2
  const offsetY = (targetH - drawH) / 2
  ctx.drawImage(garment, offsetX, offsetY, drawW, drawH)

  // Composite the design (full-canvas transparent PNG) at (0,0).
  ctx.drawImage(print, 0, 0, targetW, targetH)

  return canvas.toDataURL("image/jpeg", 0.82)
}
