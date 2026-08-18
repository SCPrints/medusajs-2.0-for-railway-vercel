"use client"

import { memo, useMemo } from "react"

import { convertToLocale } from "@lib/util/money"
import {
  calculateMaxTierSavingsPercent,
  calculateTierSavingsPercents,
} from "@lib/util/calculate-tier-savings"
import FlyToCartAddButton from "@modules/common/components/fly-to-cart-add-button"
import StockWarningIcon from "@modules/products/components/stock-warning-icon"
import {
  SCP_BLANK_ALIGNED_QUANTITY_TIERS,
  SCP_PRINT_SIZE_OPTIONS,
  resolveScpTierIndexForQuantity,
  scpPrintTotalMajorPerGarmentForSides,
  resolveScpPrintSizeForSide,
  scpPrintUnitMajorForTier,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"
import {
  GarmentSide,
  PricingBreakdown,
  PrintSpec,
  SizeQuantity,
} from "@modules/customizer/lib/types"
import {
  stockWarningMessage,
  type VariantStockState,
} from "@modules/products/lib/variant-stock"
import { TIER_GROUP_NAME_PREFIX, type Tier } from "@lib/customer-tiers"

type PricingPanelProps = {
  currencyCode: string
  pricing: PricingBreakdown
  sizes: SizeQuantity[]
  onChangeSizeQty: (size: string, quantity: number) => void
  onAddToCart: () => Promise<void>
  isSubmitting: boolean
  /** PDP embed: single size row, shorter copy. */
  embeddedOnPdp?: boolean
  /** When set, Add to cart uses the PDP fly + squish interaction (see fly-to-cart-add-button). */
  flyImageSrc?: string
  /**
   * SCP / DTF tier reference block. Set via product metadata `show_dtf_tier_estimator: true`.
   */
  showDtfTierEstimator?: boolean
  /** Shown with `embeddedOnPdp` as the step index before "Quantity & checkout" (2 or 3). */
  embedPdpQuantityStepNumber?: number
  /** Selected SCP print size (must align with cart pricing). */
  scpPrintSizeId: ScpPrintSizeId
  onScpPrintSizeIdChange: (id: ScpPrintSizeId) => void
  /** Decorated sides used for SCP totals (matches customizer canvas). */
  decoratedSides: GarmentSide[]
  /**
   * Per-image prints (one per Fabric object). When provided, the price
   * breakdown lists each print on its own line — that's how customers see
   * they're paying per transfer rather than per location.
   */
  prints?: PrintSpec[]
  /**
   * Override the auto-snapped size for a single print. Pass `null` as the
   * second argument to clear the override and let auto-snap take over again.
   */
  onChangePrintSize?: (objectId: string, sizeId: ScpPrintSizeId | null) => void
  /**
   * Allowed sizes per side (sleeves on a short-sleeve tee → A6 only, etc).
   * Falls back to the full SCP size list when omitted.
   */
  allowedPrintSizesBySide?: Partial<Record<GarmentSide, ScpPrintSizeId[]>>
  /** Hide the built-in print-size dropdown (when an external picker controls scpPrintSizeId). */
  hidePrintSizeSelector?: boolean
  /** Hide the panel header (when caller renders its own step heading). */
  hideHeader?: boolean
  /** Override the primary CTA label (e.g. "Update cart" in edit-from-cart mode). */
  primaryCtaLabel?: string
  /** Override the busy/loading CTA label. */
  primaryCtaLoadingLabel?: string
  /** Optional secondary action — when provided, renders a "Save design" button below add-to-cart. */
  onSaveDesign?: () => Promise<void>
  /** Whether the save-design action is currently running. */
  isSavingDesign?: boolean
  /**
   * Cross-cart bulk-tier aggregation projection. When set, the bulk-discount
   * tier highlight reflects the *combined* cart quantity (existing eligible
   * items + this in-progress design), not just this product's quantity. The
   * "Add N more to save X/ea" hint also speaks to the aggregated baseline.
   * Omit for the standalone (non-cart-aware) calculation.
   */
  aggregatedCartQuantity?: number
  /**
   * Per-size stock state. When supplied, sizes that are out of stock,
   * backorderable, or running low surface a hoverable `!` icon explaining
   * the possible delivery delay. Computed by the parent because the panel
   * doesn't otherwise know about variants.
   */
  stockBySize?: Record<string, VariantStockState | undefined>
  /**
   * Logged-in customer's pricing tier. When set, the panel shows a
   * "Your <tier> pricing" callout above the size matrix. The public quantity
   * ladder is already suppressed upstream (parent passes empty
   * `bulkPricingTiers`), and `pricing.discountedUnitPriceCents` reflects the
   * tier price baked into Medusa's calculated_price for this customer.
   */
  tier?: Tier | null
  /**
   * Selected variant's garment colour (hex or hsl, resolved from the swatch
   * table). When provided, size rows with a quantity > 0 fill with this colour
   * so the customer sees at a glance which sizes they're ordering and in what
   * colour — mirrors AS Colour's selected-size highlight.
   */
  variantTintHex?: string | null
}

const formatMoney = (amount: number, currencyCode: string) =>
  convertToLocale({ amount, currency_code: currencyCode })

const formatTierRange = (minQuantity: number, maxQuantity?: number) =>
  typeof maxQuantity === "number" ? `${minQuantity}-${maxQuantity}` : `${minQuantity}+`

// Picks black or white text for legibility on a given garment swatch colour.
// Accepts either `#RRGGBB` or `hsl(h, s%, l%)` (the two shapes
// `resolveGarmentSwatchColor` can return).
const getContrastTextColor = (color: string): string => {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/)
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16)
    const g = parseInt(hex[1].slice(2, 4), 16)
    const b = parseInt(hex[1].slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? "#0f172a" : "#ffffff"
  }
  const hsl = color.match(/hsl\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*(\d+(?:\.\d+)?)%/)
  if (hsl) {
    return Number(hsl[1]) > 60 ? "#0f172a" : "#ffffff"
  }
  return "#0f172a"
}

const ExpandCollapsePlus = () => (
  <span className="relative h-5 w-5">
    <span className="absolute inset-y-[31.75%] left-[48%] right-1/2 w-[1.5px] rounded-full bg-ui-fg-subtle transition-all duration-300 group-open:rotate-90" />
    <span className="absolute inset-x-[31.75%] bottom-1/2 top-[48%] h-[1.5px] rounded-full bg-ui-fg-subtle transition-all duration-300 group-open:left-1/2 group-open:right-1/2 group-open:rotate-90" />
  </span>
)

function PricingPanel({
  currencyCode,
  pricing,
  sizes,
  onChangeSizeQty,
  onAddToCart,
  isSubmitting,
  embeddedOnPdp = false,
  flyImageSrc,
  showDtfTierEstimator = false,
  embedPdpQuantityStepNumber = 3,
  scpPrintSizeId,
  onScpPrintSizeIdChange,
  decoratedSides,
  prints,
  onChangePrintSize,
  allowedPrintSizesBySide,
  hidePrintSizeSelector = false,
  hideHeader = false,
  primaryCtaLabel,
  primaryCtaLoadingLabel,
  onSaveDesign,
  isSavingDesign = false,
  aggregatedCartQuantity,
  stockBySize,
  tier = null,
  variantTintHex = null,
}: PricingPanelProps) {
  const ctaLabel = primaryCtaLabel ?? "Add to cart"
  const ctaLoadingLabel = primaryCtaLoadingLabel ?? "Adding..."
  const quantity = sizes.reduce((total, entry) => total + entry.quantity, 0)
  const safeEstimatorQuantity = Math.max(1, quantity)
  // Tier-highlight quantity: when the caller passes the cart's existing
  // eligible total, we project the tier the customer will land on *after*
  // this design is added (cart total + in-progress local quantity). If no
  // cart data is available the table falls back to today's per-product
  // behavior. NOTE: in edit-line mode this slightly overstates by the
  // existing line's quantity (it's counted twice — once in the aggregate,
  // once in the local size matrix). Acceptable for v1; the backend
  // recompute settles the actual price on submit.
  const cartAggregate =
    typeof aggregatedCartQuantity === "number" && aggregatedCartQuantity >= 0
      ? aggregatedCartQuantity
      : 0
  const tierHighlightQty = quantity + cartAggregate
  const isAggregated = cartAggregate > 0

  const safeSides = Array.isArray(decoratedSides) ? decoratedSides.length : 0

  const scpTierIndex = resolveScpTierIndexForQuantity(safeEstimatorQuantity)

  const printUnitMajorPerLocation = useMemo(() => {
    if (safeSides <= 0) {
      return 0
    }
    const firstSide = decoratedSides[0] ?? "front"
    const sizeForFirstSide = resolveScpPrintSizeForSide(firstSide, scpPrintSizeId)
    return scpPrintUnitMajorForTier(sizeForFirstSide, scpTierIndex)
  }, [decoratedSides, scpPrintSizeId, scpTierIndex, safeSides])

  const printPerGarmentMajor = useMemo(
    () =>
      scpPrintTotalMajorPerGarmentForSides({
        selectedPrintSizeId: scpPrintSizeId,
        tierIndex: scpTierIndex,
        decoratedSides,
      }),
    [decoratedSides, scpPrintSizeId, scpTierIndex]
  )

  const estimatedPrintJobMajor = printPerGarmentMajor * safeEstimatorQuantity

  const checkoutTotalCents = pricing.totalPriceCents
  const checkoutUnitCents = pricing.discountedUnitPriceCents

  const printSizeSelect = (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-ui-fg-subtle">Print size (SCP digital)</label>
      <select
        className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
        value={scpPrintSizeId}
        onChange={(event) => onScpPrintSizeIdChange(event.target.value as ScpPrintSizeId)}
      >
        {SCP_PRINT_SIZE_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} ({option.dimensionsLabel})
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-3 rounded-xl border border-ui-border-base bg-ui-bg-base p-3">
      {hideHeader ? null : (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ui-fg-base">
            {embeddedOnPdp
              ? `${embedPdpQuantityStepNumber}. Quantity & checkout`
              : "Size & quantity"}
          </h3>
          <p className="mt-1 text-xs text-ui-fg-subtle">
            Set quantities per size. Totals update with print locations and blank volume tiers.
          </p>
        </div>
      )}

      {tier ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          <p className="text-xs font-semibold uppercase tracking-wide">
            Your {tier.name.slice(TIER_GROUP_NAME_PREFIX.length)} pricing
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-800">
            {formatMoney(checkoutUnitCents, currencyCode)} / unit — flat rate, no quantity ladder.
          </p>
        </div>
      ) : null}

      {hidePrintSizeSelector ? null : printSizeSelect}

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Sizes</label>
        <div className={`grid gap-1.5 ${sizes.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
          {sizes.map((sizeEntry) => {
            const stockState = stockBySize?.[sizeEntry.size]
            const warning = stockState ? stockWarningMessage(stockState) : null
            const isTinted = sizeEntry.quantity > 0 && !!variantTintHex
            const contrastColor = isTinted ? getContrastTextColor(variantTintHex!) : null
            const labelStyle: React.CSSProperties = isTinted
              ? {
                  backgroundColor: variantTintHex!,
                  borderColor: variantTintHex!,
                  color: contrastColor!,
                }
              : {}
            const inputStyle: React.CSSProperties = isTinted
              ? {
                  backgroundColor: "transparent",
                  borderColor: `${contrastColor!}33`,
                  color: contrastColor!,
                }
              : {}
            return (
              <label
                key={sizeEntry.size}
                className="flex items-center gap-1.5 rounded-md border border-ui-border-base px-2 py-1 transition-colors duration-200"
                title={sizeEntry.size}
                style={labelStyle}
              >
                <span className="flex-1 min-w-0 truncate text-xs font-medium" aria-label={sizeEntry.size}>
                  {sizeEntry.size}
                </span>
                {warning && stockState ? (
                  <StockWarningIcon message={warning} kind={stockState.kind} />
                ) : null}
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={0}
                  max={999}
                  // Render empty (not "0") when zero so the field can be
                  // cleared and retyped — otherwise backspacing snaps to 0 and
                  // fights the caret. Mirrors the bulk-order grid input.
                  value={sizeEntry.quantity === 0 ? "" : sizeEntry.quantity}
                  onFocus={(event) => {
                    event.currentTarget.select()
                    // Lift the field above the on-screen keyboard on phones.
                    event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
                  }}
                  onChange={(event) => {
                    const raw = event.target.value
                    onChangeSizeQty(sizeEntry.size, raw === "" ? 0 : Number(raw))
                  }}
                  className="w-12 shrink-0 rounded-md border border-ui-border-base px-1.5 py-0.5 text-sm transition-colors duration-200"
                  style={inputStyle}
                />
              </label>
            )
          })}
        </div>
      </div>

      {pricing.hasBulkPricing && pricing.bulkPricingTiers?.length ? (
        (() => {
          const tiers = pricing.bulkPricingTiers
          // Shared "Discount earned" framing — reuses the same util as the
          // PDP variant ladder so phrasing stays consistent across surfaces.
          const tiersForSavings = tiers.map((t) => ({ amount: t.amountCents }))
          const tierSavingsPercents = calculateTierSavingsPercents(tiersForSavings)
          const maxTierSavings = calculateMaxTierSavingsPercent(tiersForSavings)
          const currentTierIdx = (() => {
            const safeQty = Math.max(1, tierHighlightQty)
            const idx = tiers.findIndex(
              (t) =>
                safeQty >= t.minQuantity &&
                (typeof t.maxQuantity !== "number" || safeQty <= t.maxQuantity)
            )
            return idx >= 0 ? idx : 0
          })()
          const currentTier = tiers[currentTierIdx]
          const nextTier = tiers[currentTierIdx + 1]
          const unitsToNext = nextTier
            ? Math.max(0, nextTier.minQuantity - tierHighlightQty)
            : 0
          const savings =
            nextTier && currentTier
              ? Math.max(0, currentTier.amountCents - nextTier.amountCents)
              : 0
          // Progress fraction: each tier is one equal segment; fill the
          // current segment proportionally by qty within that tier's range.
          const progressPct = (() => {
            if (tierHighlightQty <= 0 || !currentTier) return 0
            if (!nextTier) return 100
            const range = nextTier.minQuantity - currentTier.minQuantity
            const withinTier = Math.min(1, Math.max(0, (tierHighlightQty - currentTier.minQuantity) / range))
            return ((currentTierIdx + withinTier) / tiers.length) * 100
          })()
          return (
            <details className="group rounded-lg border border-ui-border-base bg-ui-bg-subtle/40">
              <summary className="block cursor-pointer list-none px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-ui-fg-base">
                    <span>Bulk discounts</span>
                    {maxTierSavings > 0 ? (
                      <span className="text-[10px] font-semibold normal-case tracking-normal text-emerald-700">
                        Save up to {maxTierSavings}%
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {currentTier && tierHighlightQty > 0 ? (
                      <span className="text-xs font-semibold text-emerald-700">
                        {formatMoney(currentTier.amountCents, currencyCode)} / ea
                      </span>
                    ) : null}
                    <ExpandCollapsePlus />
                  </span>
                </div>
                <div className="relative mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-ui-bg-base-hover">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {tiers.slice(1).map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 w-0.5 rounded-full bg-white"
                      style={{ left: `calc(${((i + 1) / tiers.length) * 100}% - 1px)` }}
                    />
                  ))}
                </div>
              </summary>
              <div className="space-y-2 border-t border-ui-border-base px-3 pb-3 pt-2">
                {nextTier && unitsToNext > 0 && tierHighlightQty > 0 ? (
                  <p className="text-[11px] text-emerald-700">
                    Add {unitsToNext} more {isAggregated ? "across your cart " : ""}to save {formatMoney(savings, currencyCode)}/ea
                  </p>
                ) : null}
                {isAggregated ? (
                  <p className="text-[11px] text-emerald-700">
                    Including {cartAggregate} unit{cartAggregate === 1 ? "" : "s"} already in your cart, your projected tier is highlighted below.
                  </p>
                ) : null}
                <ul className="grid grid-cols-1 gap-1 text-xs">
                  {tiers.map((tier, idx) => {
                    const isCurrent = idx === currentTierIdx && tierHighlightQty > 0
                    const savingsPct = tierSavingsPercents[idx] ?? 0
                    return (
                      <li
                        key={`${tier.minQuantity}-${tier.maxQuantity ?? "max"}`}
                        className={`flex items-center justify-between gap-2 rounded px-2 py-1 transition-colors ${
                          isCurrent
                            ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                            : "text-ui-fg-subtle"
                        }`}
                      >
                        <span className={isCurrent ? "font-semibold" : ""}>
                          {formatTierRange(tier.minQuantity, tier.maxQuantity)} pcs
                        </span>
                        <span className="flex items-baseline gap-1.5">
                          <span className={isCurrent ? "font-semibold" : ""}>
                            {formatMoney(tier.amountCents, currencyCode)} / ea
                          </span>
                          {savingsPct > 0 ? (
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                                isCurrent
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              Save {savingsPct}%
                            </span>
                          ) : null}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </details>
          )
        })()
      ) : null}

      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle/60 px-3 py-2.5">
        <p className="flex justify-between text-xs">
          <span className="text-ui-fg-subtle">Unit</span>
          <span className="font-medium text-ui-fg-base">{formatMoney(checkoutUnitCents, currencyCode)}</span>
        </p>
        {quantity > 0 ? (
          <p className="mt-1.5 flex justify-between text-sm font-semibold">
            <span className="text-ui-fg-base">Checkout total ({quantity})</span>
            <span className="text-ui-fg-base">
              {formatMoney(checkoutTotalCents, currencyCode)}
            </span>
          </p>
        ) : (
          <p className="mt-1.5 flex items-center justify-between text-xs text-ui-fg-subtle">
            <span>Add sizes above to see your total</span>
            <span aria-hidden>—</span>
          </p>
        )}
      </div>

      {showDtfTierEstimator ? (
        <details className="group rounded-lg border border-ui-border-base bg-ui-bg-subtle/40 p-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-ui-fg-base marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              SCP print tier reference
              <ExpandCollapsePlus />
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-ui-border-base pt-3">
            <div>
              <p className="mt-1 text-xs text-ui-fg-subtle">
                Per garment, per print location. Quantity tiers match blank bulk bands (1–9, 10–19,
                20–49, 50–99, 100+).
              </p>
            </div>

            <p className="flex justify-between text-xs">
              <span className="text-ui-fg-subtle">Applied tier</span>
              <span className="font-medium text-ui-fg-base">
                {SCP_BLANK_ALIGNED_QUANTITY_TIERS[scpTierIndex]?.label ?? "Qty 1–9"}
              </span>
            </p>
            <p className="flex justify-between text-xs">
              <span className="text-ui-fg-subtle">Print / location (this tier)</span>
              <span className="font-medium text-ui-fg-base">
                {formatMoney(printUnitMajorPerLocation, currencyCode)}
              </span>
            </p>
            <p className="flex justify-between text-xs">
              <span className="text-ui-fg-subtle">Print total / garment ({safeSides} loc.)</span>
              <span className="font-medium text-ui-fg-base">
                {formatMoney(printPerGarmentMajor, currencyCode)}
              </span>
            </p>
            <p className="flex justify-between text-sm font-semibold">
              <span className="text-ui-fg-base">Est. print fees ({safeEstimatorQuantity} pcs)</span>
              <span className="text-ui-fg-base">{formatMoney(estimatedPrintJobMajor, currencyCode)}</span>
            </p>
          </div>
        </details>
      ) : null}

      <details
        className="group rounded-lg border border-ui-border-base bg-ui-bg-subtle/50"
        open={
          pricing.sideSurchargePerUnitCents > 0 ||
          pricing.embroideryPerUnitCents > 0 ||
          (pricing.screenPerUnitCents ?? 0) > 0
        }
      >
        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-ui-fg-base marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Price breakdown
            <ExpandCollapsePlus />
          </span>
        </summary>
        <div className="space-y-1 border-t border-ui-border-base px-3 pb-3 pt-2 text-xs">
          <p className="flex justify-between">
            <span>Base unit</span>
            <span>{formatMoney(pricing.baseUnitPriceCents, currencyCode)}</span>
          </p>
          {prints && prints.length > 0 ? (
            <div className="space-y-1">
              <p className="flex justify-between font-medium">
                <span>Prints / garment</span>
                <span>{formatMoney(pricing.sideSurchargePerUnitCents, currencyCode)}</span>
              </p>
              <ul className="space-y-1 pl-2 text-[11px]">
                {prints.map((print, idx) => {
                  const sizeId = resolveScpPrintSizeForSide(print.side, print.sizeId)
                  const unit = scpPrintUnitMajorForTier(sizeId, scpTierIndex)
                  const sideLabel = (print.side ?? "").replace(/_/g, " ") || "side"
                  const allowed =
                    allowedPrintSizesBySide?.[print.side] ??
                    SCP_PRINT_SIZE_OPTIONS.map((opt) => opt.id)
                  const allowedSet = new Set(allowed)
                  // The current sizeId may be outside `allowed` (e.g. a
                  // sleeve forced to A6). Surface it as the chosen value
                  // anyway so the dropdown reflects reality.
                  const optionsForRow = SCP_PRINT_SIZE_OPTIONS.filter(
                    (opt) => allowedSet.has(opt.id) || opt.id === sizeId
                  )
                  const editable = !!onChangePrintSize && optionsForRow.length > 1
                  return (
                    <li
                      key={`${print.objectId}-${idx}`}
                      className="flex items-center justify-between gap-2 text-ui-fg-subtle"
                    >
                      <span className="capitalize">
                        Print {idx + 1} · {sideLabel}
                        {print.approxCm.width > 0 && print.approxCm.height > 0
                          ? ` · ~${Math.round(print.approxCm.width)}×${Math.round(
                              print.approxCm.height
                            )} cm`
                          : ""}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {editable ? (
                          <select
                            value={sizeId}
                            onChange={(event) =>
                              onChangePrintSize?.(
                                print.objectId,
                                event.target.value as ScpPrintSizeId
                              )
                            }
                            className="rounded border border-ui-border-base bg-ui-bg-base px-1 py-0.5 text-[11px]"
                            title={
                              print.manualSize
                                ? "Manually chosen — click 'Auto' to restore auto-snap"
                                : "Auto-snapped from bounding box"
                            }
                          >
                            {optionsForRow.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            {SCP_PRINT_SIZE_OPTIONS.find((opt) => opt.id === sizeId)
                              ?.label ?? sizeId}
                          </span>
                        )}
                        {print.manualSize && onChangePrintSize ? (
                          <button
                            type="button"
                            onClick={() => onChangePrintSize?.(print.objectId, null)}
                            className="text-[10px] uppercase tracking-wide text-ui-fg-muted hover:text-ui-fg-base"
                            title="Clear manual size — auto-snap will take over"
                          >
                            Auto
                          </button>
                        ) : null}
                        <span className="font-medium text-ui-fg-base">
                          {formatMoney(unit, currencyCode)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <p className="flex justify-between">
              <span>SCP print (all locations) / garment</span>
              <span>{formatMoney(pricing.sideSurchargePerUnitCents, currencyCode)}</span>
            </p>
          )}
          {pricing.embroideryRows && pricing.embroideryRows.length > 0 ? (
            <div className="space-y-1">
              <p className="flex justify-between font-medium">
                <span>Embroidery / garment</span>
                <span>{formatMoney(pricing.embroideryPerUnitCents, currencyCode)}</span>
              </p>
              <ul className="space-y-1 pl-2 text-[11px]">
                {pricing.embroideryRows.map((row) => (
                  <li
                    key={`emb-${row.side}`}
                    className="flex items-center justify-between gap-2 text-ui-fg-subtle"
                  >
                    <span className="capitalize">
                      {row.side.replace(/_/g, " ")} · ~
                      {row.stitchCount.toLocaleString()} stitches
                    </span>
                    <span className="font-medium text-ui-fg-base">
                      {row.requiresQuote
                        ? "Quote required"
                        : formatMoney(row.unitPriceCents, currencyCode)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {pricing.screenRows && pricing.screenRows.length > 0 ? (
            <div className="space-y-1">
              <p className="flex justify-between font-medium">
                <span>Screen print / garment</span>
                <span>{formatMoney(pricing.screenPerUnitCents ?? 0, currencyCode)}</span>
              </p>
              <ul className="space-y-1 pl-2 text-[11px]">
                {pricing.screenRows.map((row) => (
                  <li
                    key={`scr-${row.side}`}
                    className="flex items-center justify-between gap-2 text-ui-fg-subtle"
                  >
                    <span className="capitalize">
                      {row.side.replace(/_/g, " ")} · {row.effectiveColours} colour
                      {row.effectiveColours > 1 ? "s" : ""}
                      {row.effectiveColours > row.colours ? " (incl. underbase)" : ""}
                    </span>
                    <span className="font-medium text-ui-fg-base">
                      {formatMoney(row.unitPriceCents, currencyCode)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ui-fg-subtle">
                + screen setup added as its own cart line ($99 per screen, one screen per colour).
              </p>
              {pricing.screenBelowMinimum ? (
                <p className="text-[11px] font-medium text-ui-fg-error">
                  Screen printing needs 25+ pieces — increase quantity or switch to Print (DTF).
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="flex justify-between">
            <span>Discount</span>
            <span>{Math.round(pricing.quantityDiscountRate * 100)}%</span>
          </p>
          <p className="flex justify-between font-medium">
            <span>Unit after discount</span>
            <span>{formatMoney(pricing.discountedUnitPriceCents, currencyCode)}</span>
          </p>
          <p className="flex justify-between font-semibold text-sm">
            <span>Total ({quantity})</span>
            <span>{formatMoney(pricing.totalPriceCents, currencyCode)}</span>
          </p>
        </div>
      </details>

      {flyImageSrc ? (
        <FlyToCartAddButton
          onAddToCart={() => {
            void onAddToCart()
          }}
          disabled={isSubmitting || quantity <= 0}
          isLoading={isSubmitting}
          className="w-full rounded-xl px-4 py-3.5 text-base font-semibold shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          flyImageSrc={flyImageSrc}
        >
          {isSubmitting ? ctaLoadingLabel : ctaLabel}
        </FlyToCartAddButton>
      ) : (
        <button
          type="button"
          onClick={() => {
            void onAddToCart()
          }}
          disabled={isSubmitting || quantity <= 0}
          title={quantity <= 0 ? "Enter a quantity for at least one size first" : undefined}
          className="w-full rounded-xl bg-ui-fg-base px-4 py-3.5 text-base font-semibold text-ui-bg-base shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? ctaLoadingLabel : ctaLabel}
        </button>
      )}

      {onSaveDesign ? (
        <button
          type="button"
          onClick={() => {
            void onSaveDesign()
          }}
          disabled={isSavingDesign || isSubmitting}
          className="w-full rounded-xl border border-ui-border-base bg-ui-bg-base px-4 py-2.5 text-sm font-medium text-ui-fg-base transition hover:bg-ui-bg-subtle disabled:opacity-50"
        >
          {isSavingDesign ? "Saving design…" : "Save to my designs"}
        </button>
      ) : null}
    </div>
  )
}

// Memoised so it skips re-renders driven by unrelated customizer state (wizard
// step, layer selection, DPI warnings, …). The parent stabilises every prop:
// `pricing` is useMemo'd and the handlers use the latest-ref pattern.
export default memo(PricingPanel)
