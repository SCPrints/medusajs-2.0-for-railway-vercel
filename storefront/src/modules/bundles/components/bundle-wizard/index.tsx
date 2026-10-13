"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { addBundleToCartSafe, retrieveCart } from "@lib/data/cart"
import { createGroupOrder } from "@lib/data/group-order"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { uploadCustomerOriginalUnchanged } from "@modules/customizer/lib/upload-customer-original"
import {
  extractCartDesigns,
  filterByKind,
  type CartDesignSource,
} from "@lib/util/cart-decorations"
import StockWarningIcon from "@modules/products/components/stock-warning-icon"
import {
  aggregateStockKind,
  getVariantStockState,
  stockWarningMessage,
} from "@modules/products/lib/variant-stock"
import type {
  BundleItem,
  BundleProduct,
  BundleProductVariant,
  BundleWithProducts,
} from "@lib/data/bundles"
import { describePositions } from "@modules/bundles/lib/positions"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COLOR_RE = /(color|colour|shade)/i
const SIZE_RE = /size/i

function isColorOption(title: string | null | undefined) {
  return typeof title === "string" && COLOR_RE.test(title)
}

function getOptionValue(
  variant: BundleProductVariant,
  optionId: string
): string | null {
  const opt = (variant.options ?? []).find((o) => o.option?.id === optionId)
  return opt?.value ?? null
}

function getUniqueColors(
  product: BundleProduct
): { optionId: string; values: string[] } | null {
  const colorOption = (product.options ?? []).find((o) =>
    isColorOption(o.title)
  )
  if (!colorOption) return null
  const seen = new Set<string>()
  const values: string[] = []
  for (const v of product.variants) {
    const val = getOptionValue(v, colorOption.id)
    if (val && !seen.has(val)) {
      seen.add(val)
      values.push(val)
    }
  }
  return { optionId: colorOption.id, values }
}

function getSizesForColor(
  product: BundleProduct,
  /** null = product has no colour option; every variant counts. */
  colorOptionId: string | null,
  selectedColor: string | null
): { optionId: string; values: string[] } | null {
  const sizeOption = (product.options ?? []).find(
    (o) => SIZE_RE.test(o.title ?? "") && !isColorOption(o.title)
  )
  if (!sizeOption) return null
  const seen = new Set<string>()
  const values: string[] = []
  for (const v of product.variants) {
    if (colorOptionId && getOptionValue(v, colorOptionId) !== selectedColor) continue
    const size = getOptionValue(v, sizeOption.id)
    if (size && !seen.has(size)) {
      seen.add(size)
      values.push(size)
    }
  }
  return { optionId: sizeOption.id, values }
}

function findVariantId(
  product: BundleProduct,
  colorOptionId: string | null,
  selectedColor: string | null,
  sizeOptionId: string | null,
  sizeValue: string
): string | null {
  for (const v of product.variants) {
    const colorMatch =
      !colorOptionId ||
      !selectedColor ||
      getOptionValue(v, colorOptionId) === selectedColor
    const sizeMatch =
      !sizeOptionId || getOptionValue(v, sizeOptionId) === sizeValue
    if (colorMatch && sizeMatch) return v.id
  }
  return null
}

function findVariant(
  product: BundleProduct,
  colorOptionId: string | null,
  selectedColor: string | null,
  sizeOptionId: string | null,
  sizeValue: string
): BundleProductVariant | null {
  for (const v of product.variants) {
    const colorMatch =
      !colorOptionId ||
      !selectedColor ||
      getOptionValue(v, colorOptionId) === selectedColor
    const sizeMatch =
      !sizeOptionId || getOptionValue(v, sizeOptionId) === sizeValue
    if (colorMatch && sizeMatch) return v
  }
  return null
}

function variantsForColor(
  product: BundleProduct,
  colorOptionId: string,
  color: string
): BundleProductVariant[] {
  return product.variants.filter(
    (v) => getOptionValue(v, colorOptionId) === color
  )
}

function choicesFor(item: BundleItem) {
  const options = item.choices?.options ?? []
  return options.length >= 2 ? options : []
}

/**
 * Variant lines for one item. Sized garments use the size grid; one-size
 * garments (caps, totes) — and garments with no colour option — get a
 * single line at the pack quantity, so they're never silently dropped.
 */
function linesForItem(
  product: BundleProduct | null,
  cfg: ProductConfig,
  item: BundleItem,
  multiplier: number
): Array<{ variantId: string; quantity: number }> {
  if (!product) return []
  const colorInfo = getUniqueColors(product)
  const needsColor = !!colorInfo && colorInfo.values.length > 0
  if (needsColor && !cfg.selectedColor) return []
  const colorOptionId = needsColor ? colorInfo!.optionId : null
  const sizeInfo = getSizesForColor(product, colorOptionId, cfg.selectedColor)
  if (sizeInfo && sizeInfo.values.length > 0) {
    return Object.entries(cfg.sizeQtys)
      .filter(([, qty]) => qty > 0)
      .map(([size, quantity]) => ({
        variantId: findVariantId(product, colorOptionId, cfg.selectedColor, sizeInfo.optionId, size),
        quantity,
      }))
      .filter((l): l is { variantId: string; quantity: number } => !!l.variantId)
  }
  const variantId = findVariantId(product, colorOptionId, cfg.selectedColor, null, "")
  return variantId
    ? [{ variantId, quantity: Math.max(1, item.quantity_per_unit * multiplier) }]
    : []
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

type SizeQtys = Record<string, number>

type ProductConfig = {
  selectedColor: string | null
  colorOptionId: string | null
  sizeOptionId: string | null
  sizeQtys: SizeQtys
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function BundleWizard({
  bundle,
}: {
  bundle: BundleWithProducts
}) {
  const params = useParams()
  const router = useRouter()
  const countryCode = (params.countryCode as string) ?? "au"

  const items = useMemo(
    () => [...bundle.items].sort((a, b) => a.position - b.position),
    [bundle.items]
  )

  const TOTAL_STEPS =
    1 + // overview
    items.length + // one product config per item
    1 + // artwork + notes
    1 // review

  const [step, setStep] = useState(0)
  const [multiplier, setMultiplier] = useState(1)
  const [chosenHandles, setChosenHandles] = useState<string[]>(() =>
    items.map((i) => i.product_handle)
  )
  const productFor = (idx: number): BundleProduct | null =>
    bundle.products[chosenHandles[idx] ?? ""] ?? null

  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>(() =>
    items.map(() => ({
      selectedColor: null,
      colorOptionId: null,
      sizeOptionId: null,
      sizeQtys: {},
    }))
  )

  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  const [decorationNotes, setDecorationNotes] = useState("")
  const [uploading, setUploading] = useState(false)
  const [addingToCart, setAddingToCart] = useState(false)
  const [cartError, setCartError] = useState<string | null>(null)
  const [cartDesigns, setCartDesigns] = useState<CartDesignSource[]>([])
  const [loadedCart, setLoadedCart] = useState(false)
  const [reusedFrom, setReusedFrom] = useState<string | null>(null)

  const overviewStep = 0
  const reviewStep = TOTAL_STEPS - 1
  const artworkStep = reviewStep - 1

  function productStepIndex(step: number) {
    return step - 1
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleColorSelect = useCallback(
    (itemIdx: number, colorOptionId: string, colorValue: string, product: BundleProduct) => {
      const sizes = getSizesForColor(product, colorOptionId, colorValue)
      const baseQty = Math.max(1, (items[itemIdx]?.quantity_per_unit ?? 1) * multiplier)
      const sizeQtys: SizeQtys = {}
      if (sizes) {
        for (const s of sizes.values) {
          sizeQtys[s] = baseQty
        }
      }
      setProductConfigs((prev) =>
        prev.map((cfg, i) =>
          i === itemIdx
            ? {
                selectedColor: colorValue,
                colorOptionId,
                sizeOptionId: sizes?.optionId ?? null,
                sizeQtys,
              }
            : cfg
        )
      )
    },
    [items, multiplier]
  )

  const handleChoose = (itemIdx: number, handle: string) => {
    setChosenHandles((prev) => prev.map((h, i) => (i === itemIdx ? handle : h)))
    // A different garment has different colours/sizes — start that item over.
    setProductConfigs((prev) =>
      prev.map((cfg, i) =>
        i === itemIdx
          ? { selectedColor: null, colorOptionId: null, sizeOptionId: null, sizeQtys: {} }
          : cfg
      )
    )
  }

  const handleSizeQtyChange = useCallback(
    (itemIdx: number, sizeValue: string, qty: number) => {
      setProductConfigs((prev) =>
        prev.map((cfg, i) =>
          i === itemIdx
            ? { ...cfg, sizeQtys: { ...cfg.sizeQtys, [sizeValue]: Math.max(0, qty) } }
            : cfg
        )
      )
    },
    []
  )

  const handleArtworkUpload = async (file: File) => {
    setArtworkFile(file)
    setReusedFrom(null)
    setUploading(true)
    try {
      const url = await uploadCustomerOriginalUnchanged(file)
      setArtworkUrl(url)
    } finally {
      setUploading(false)
    }
  }

  const handleReuseDesign = (design: CartDesignSource) => {
    setArtworkUrl(design.artworkUrl)
    setArtworkFile(null)
    if (design.decorationNotes) {
      setDecorationNotes(design.decorationNotes)
    }
    setReusedFrom(design.bundleTitle ?? design.productTitle)
  }

  // Load cart designs when entering the artwork step
  const artworkStepIndex = items.length + 1
  useEffect(() => {
    if (step !== artworkStepIndex || loadedCart) return
    setLoadedCart(true)
    void retrieveCart().then((cart) => {
      if (!cart) return
      // Bundle wizard reuses artwork URL + notes; embroidery-only entries
      // don't carry an artwork URL we can pre-fill, so they're filtered out.
      setCartDesigns(filterByKind(extractCartDesigns(cart), ["artwork", "notes-only"]))
    })
  }, [step, artworkStepIndex, loadedCart])

  const handleAddToCart = async () => {
    setAddingToCart(true)
    setCartError(null)
    try {
      const payloadItems = items
        .map((item, i) => ({
          bundleItemId: item.id,
          productHandle: chosenHandles[i],
          lines: linesForItem(productFor(i), productConfigs[i], item, multiplier),
        }))
        .filter((it) => it.lines.length > 0)

      if (!payloadItems.length) {
        setCartError("Pick at least one size and quantity before adding to cart.")
        return
      }

      const result = await addBundleToCartSafe({
        countryCode,
        bundleHandle: bundle.handle,
        artworkUrl,
        notes: decorationNotes.trim() || null,
        items: payloadItems,
      })
      if (!result.ok) {
        setCartError(result.error)
        return
      }

      router.push(`/${countryCode}/cart`)
    } catch (err: unknown) {
      setCartError(
        err instanceof Error ? err.message : "An error occurred. Please try again."
      )
    } finally {
      setAddingToCart(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const progressPct = Math.round((step / (TOTAL_STEPS - 1)) * 100)

  return (
    <div className="flex flex-col gap-y-6">
      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
        <div
          className="h-full rounded-full bg-ui-fg-interactive transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step content */}
      {step === overviewStep && (
        <OverviewStep
          bundle={bundle}
          items={items}
          multiplier={multiplier}
          onMultiplierChange={setMultiplier}
          onNext={() => setStep(1)}
        />
      )}

      {step > overviewStep && step <= items.length && (() => {
        const itemIdx = productStepIndex(step)
        const bundleItem = items[itemIdx]
        const product = productFor(itemIdx)
        const cfg = productConfigs[itemIdx]
        return (
          <ProductConfigStep
            bundleItem={bundleItem}
            product={product}
            config={cfg}
            multiplier={multiplier}
            chosenHandle={chosenHandles[itemIdx]}
            onChoose={(handle) => handleChoose(itemIdx, handle)}
            itemIdx={itemIdx}
            totalItems={items.length}
            onColorSelect={(colorOptionId, colorValue) =>
              handleColorSelect(itemIdx, colorOptionId, colorValue, product!)
            }
            onSizeQtyChange={(sizeValue, qty) =>
              handleSizeQtyChange(itemIdx, sizeValue, qty)
            }
            onBack={() => setStep((s) => s - 1)}
            onNext={() => setStep((s) => s + 1)}
          />
        )
      })()}

      {step === artworkStep && (
        <ArtworkStep
          artworkFile={artworkFile}
          artworkUrl={artworkUrl}
          decorationNotes={decorationNotes}
          uploading={uploading}
          cartDesigns={cartDesigns}
          reusedFrom={reusedFrom}
          onFileChange={handleArtworkUpload}
          onNotesChange={setDecorationNotes}
          onReuseDesign={handleReuseDesign}
          onBack={() => setStep((s) => s - 1)}
          onNext={() => setStep((s) => s + 1)}
        />
      )}

      {step === reviewStep && (
        <ReviewStep
          bundle={bundle}
          items={items}
          productConfigs={productConfigs}
          products={items.map((_, i) => productFor(i))}
          multiplier={multiplier}
          artworkUrl={artworkUrl}
          decorationNotes={decorationNotes}
          addingToCart={addingToCart}
          cartError={cartError}
          onBack={() => setStep((s) => s - 1)}
          onAddToCart={handleAddToCart}
        />
      )}

      {step === reviewStep && (
        <TeamOrderPanel
          bundle={bundle}
          missingColour={items
            .filter((_, i) => {
              const product = productFor(i)
              const colours = product ? getUniqueColors(product) : null
              return !!colours?.values.length && !productConfigs[i].selectedColor
            })
            .map((item) => item.label)}
          onCreate={(title, email) =>
            createGroupOrder({
              title,
              owner_email: email,
              bundle_handle: bundle.handle,
              bundle_config: {
                artwork_url: artworkUrl,
                notes: decorationNotes.trim() || null,
                items: items
                  .map((item, i) => ({
                    bundle_item_id: item.id,
                    product_handle: chosenHandles[i],
                    color: productConfigs[i].selectedColor,
                  }))
                  .filter((_, i) => !!productFor(i)),
              },
            }).then((res) => {
              if (res.ok) router.push(`/${countryCode}/account/group-orders`)
              return res
            })
          }
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function OverviewStep({
  bundle,
  items,
  multiplier,
  onMultiplierChange,
  onNext,
}: {
  bundle: BundleWithProducts
  items: BundleItem[]
  multiplier: number
  onMultiplierChange: (v: number) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ui-fg-base">What&rsquo;s in this pack</h2>
        <ul className="mt-4 flex flex-col gap-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-x-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-bg-subtle text-xs font-medium text-ui-fg-base">
                {item.quantity_per_unit}×
              </span>
              <span className="text-sm text-ui-fg-base">{item.label}</span>
              <span className="ml-auto text-right text-xs text-ui-fg-muted">
                {describePositions(item)}
              </span>
            </li>
          ))}
        </ul>
        {bundle.discount_pct ? (
          <p className="mt-4 text-sm font-medium text-ui-fg-base">
            Save {bundle.discount_pct}% when you order the full pack.
          </p>
        ) : null}
      </div>

      {bundle.quantity_multiplier_label ? (
        <div className="flex flex-col gap-y-2">
          <label className="text-sm font-medium text-ui-fg-base">
            {bundle.quantity_multiplier_label}
          </label>
          <div className="flex items-center gap-x-3">
            <button
              onClick={() => onMultiplierChange(Math.max(1, multiplier - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-subtle"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={multiplier}
              onChange={(e) =>
                onMultiplierChange(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-16 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-center text-sm text-ui-fg-base"
            />
            <button
              onClick={() => onMultiplierChange(multiplier + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-subtle"
            >
              +
            </button>
          </div>
          <p className="text-xs text-ui-fg-muted">
            All quantities below will be multiplied by this number.
          </p>
        </div>
      ) : null}

      <button
        onClick={onNext}
        className="self-start rounded-full bg-ui-fg-base px-6 py-2.5 text-sm font-medium text-ui-bg-base hover:opacity-90 transition"
      >
        Let&rsquo;s build your pack →
      </button>
    </div>
  )
}

function ProductConfigStep({
  bundleItem,
  product,
  config,
  multiplier,
  chosenHandle,
  onChoose,
  itemIdx,
  totalItems,
  onColorSelect,
  onSizeQtyChange,
  onBack,
  onNext,
}: {
  bundleItem: BundleItem
  product: BundleProduct | null
  config: ProductConfig
  multiplier: number
  chosenHandle: string
  onChoose: (handle: string) => void
  itemIdx: number
  totalItems: number
  onColorSelect: (colorOptionId: string, colorValue: string) => void
  onSizeQtyChange: (sizeValue: string, qty: number) => void
  onBack: () => void
  onNext: () => void
}) {
  const colorInfo = product ? getUniqueColors(product) : null
  const needsColor = !!colorInfo && colorInfo.values.length > 0
  const colorReady = !needsColor || !!config.selectedColor
  const sizeInfo =
    product && colorReady
      ? getSizesForColor(product, needsColor ? colorInfo!.optionId : null, config.selectedColor)
      : null
  const oneSize = !!product && colorReady && (!sizeInfo || sizeInfo.values.length === 0)
  const choices = choicesFor(bundleItem)

  const hasQty = Object.values(config.sizeQtys).some((q) => q > 0)
  const canProceed = !product || hasQty || oneSize

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ui-fg-base">
          {bundleItem.label}
        </h2>
        <span className="text-sm text-ui-fg-muted">
          Item {itemIdx + 1} of {totalItems}
        </span>
      </div>
      <p className="-mt-4 text-sm text-ui-fg-subtle">{describePositions(bundleItem)}</p>

      {choices.length ? (
        <div className="flex flex-col gap-y-2">
          <p className="text-sm font-medium text-ui-fg-base">Choose a style</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice.product_handle}
                onClick={() => onChoose(choice.product_handle)}
                className={[
                  "min-h-11 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                  chosenHandle === choice.product_handle
                    ? "border-ui-fg-interactive bg-ui-fg-interactive text-ui-bg-base"
                    : "border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-subtle",
                ].join(" ")}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!product ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-5">
          <p className="text-sm text-ui-fg-subtle">
            Product details for this item will be confirmed by our team. Continue
            and leave a note in the decoration step if you have specific
            requirements.
          </p>
        </div>
      ) : (
        <>
          {/* Colour picker */}
          {colorInfo && colorInfo.values.length > 0 ? (
            <div className="flex flex-col gap-y-2">
              <p className="text-sm font-medium text-ui-fg-base">Select colour</p>
              <div className="flex flex-wrap gap-2">
                {colorInfo.values.map((color) => {
                  const colorVariants = variantsForColor(
                    product,
                    colorInfo.optionId,
                    color
                  )
                  const aggKind = aggregateStockKind(colorVariants)
                  // Pill warning only fires for fully-out / backorder
                  // colours; "low_stock" stays quiet because individual
                  // size warnings carry that nuance once the customer picks.
                  const colorWarning =
                    aggKind === "out_of_stock"
                      ? "All sizes in this colour are out of stock."
                      : aggKind === "backorder"
                        ? "Currently out of stock — you can still order, but it may take longer to ship while we restock."
                        : null
                  return (
                    <span key={color} className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => onColorSelect(colorInfo.optionId, color)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          config.selectedColor === color
                            ? "border-ui-fg-interactive bg-ui-fg-interactive text-ui-bg-base"
                            : "border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-subtle",
                        ].join(" ")}
                      >
                        {color}
                      </button>
                      {colorWarning ? (
                        <StockWarningIcon message={colorWarning} kind={aggKind} />
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Size qty table */}
          {colorReady && sizeInfo && sizeInfo.values.length > 0 ? (
            <div className="flex flex-col gap-y-2">
              <p className="text-sm font-medium text-ui-fg-base">
                Set quantities per size
              </p>
              <div className="overflow-hidden rounded-xl border border-ui-border-base">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ui-border-base bg-ui-bg-subtle">
                      <th className="px-4 py-2 text-left text-xs font-medium text-ui-fg-muted">
                        Size
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ui-fg-muted">
                        Quantity
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeInfo.values.map((size) => {
                      const requested = config.sizeQtys[size] ?? 0
                      const variant = findVariant(
                        product,
                        needsColor ? colorInfo!.optionId : null,
                        config.selectedColor,
                        sizeInfo.optionId,
                        size
                      )
                      const stockState = getVariantStockState(variant, {
                        requestedQuantity: requested,
                      })
                      const warning = stockWarningMessage(stockState)
                      return (
                        <tr
                          key={size}
                          className="border-b border-ui-border-base last:border-0"
                        >
                          <td className="px-4 py-2.5 text-ui-fg-base">
                            <span className="inline-flex items-center gap-1.5">
                              {size}
                              {warning ? (
                                <StockWarningIcon
                                  message={warning}
                                  kind={stockState.kind}
                                />
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              value={requested}
                              onChange={(e) =>
                                onSizeQtyChange(
                                  size,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-20 rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 text-sm text-ui-fg-base"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* No size options — product has no size option (e.g. one-size) */}
          {oneSize && product.variants.length > 0 ? (
            <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4">
              <p className="text-sm text-ui-fg-subtle">
                This item is one-size. Quantity will be set to{" "}
                {Math.max(1, bundleItem.quantity_per_unit * multiplier)}.
              </p>
            </div>
          ) : null}
        </>
      )}

      <div className="flex items-center gap-x-3">
        <button
          onClick={onBack}
          className="rounded-full border border-ui-border-base px-5 py-2 text-sm text-ui-fg-base hover:bg-ui-bg-subtle transition"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="rounded-full bg-ui-fg-base px-6 py-2 text-sm font-medium text-ui-bg-base transition hover:opacity-90 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function ArtworkStep({
  artworkFile,
  artworkUrl,
  decorationNotes,
  uploading,
  cartDesigns,
  reusedFrom,
  onFileChange,
  onNotesChange,
  onReuseDesign,
  onBack,
  onNext,
}: {
  artworkFile: File | null
  artworkUrl: string | null
  decorationNotes: string
  uploading: boolean
  cartDesigns: CartDesignSource[]
  reusedFrom: string | null
  onFileChange: (file: File) => void
  onNotesChange: (v: string) => void
  onReuseDesign: (design: CartDesignSource) => void
  onBack: () => void
  onNext: () => void
}) {
  const [showCartPicker, setShowCartPicker] = useState(false)

  return (
    <div className="flex flex-col gap-y-6">
      <h2 className="text-xl font-semibold text-ui-fg-base">
        Artwork &amp; decoration notes
      </h2>

      {/* Reuse design from cart */}
      {cartDesigns.length > 0 ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4">
          {!showCartPicker ? (
            <div className="flex items-center justify-between gap-x-3">
              <div>
                <p className="text-sm font-medium text-ui-fg-base">
                  Already have a design in your cart?
                </p>
                <p className="text-xs text-ui-fg-muted mt-0.5">
                  Reuse it for this pack instead of uploading again.
                </p>
              </div>
              <button
                onClick={() => setShowCartPicker(true)}
                className="shrink-0 rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-1.5 text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle-hover"
              >
                Browse →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ui-fg-base">
                  Pick a design to reuse
                </p>
                <button
                  onClick={() => setShowCartPicker(false)}
                  className="text-xs text-ui-fg-muted hover:text-ui-fg-base"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-col gap-y-2">
                {cartDesigns.map((design) => (
                  <button
                    key={design.lineItemId}
                    onClick={() => {
                      onReuseDesign(design)
                      setShowCartPicker(false)
                    }}
                    className="flex items-center gap-x-3 rounded-lg border border-ui-border-base bg-ui-bg-base p-3 text-left hover:border-ui-border-interactive hover:bg-ui-bg-subtle-hover transition"
                  >
                    {design.artworkUrl ? (
                      <img
                        src={design.artworkUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md border border-ui-border-base bg-white object-contain"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle text-lg">
                        📝
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ui-fg-base truncate">
                        {design.bundleTitle ?? design.productTitle}
                      </p>
                      {design.decorationNotes ? (
                        <p className="text-xs text-ui-fg-muted line-clamp-1">
                          {design.decorationNotes}
                        </p>
                      ) : design.artworkUrl ? (
                        <p className="text-xs text-ui-fg-muted">Artwork only</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {reusedFrom ? (
        <div className="flex items-center gap-x-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
          <span className="text-sm text-ui-fg-base">
            ✓ Reusing design from <strong>{reusedFrom}</strong>
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-y-2">
        <p className="text-sm font-medium text-ui-fg-base">
          {cartDesigns.length > 0 ? "Or upload" : "Upload"} your logo or artwork <span className="font-normal text-ui-fg-muted">(optional — you can send it later)</span>
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-y-2 rounded-xl border-2 border-dashed border-ui-border-base bg-ui-bg-subtle p-8 transition hover:border-ui-border-interactive">
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileChange(file)
            }}
          />
          {uploading ? (
            <span className="text-sm text-ui-fg-muted">Uploading…</span>
          ) : artworkFile ? (
            <>
              <span className="text-sm font-medium text-ui-fg-interactive">
                ✓ {artworkFile.name}
              </span>
              <span className="text-xs text-ui-fg-muted">Click to change</span>
            </>
          ) : (
            <>
              <span className="text-2xl">📎</span>
              <span className="text-sm text-ui-fg-muted">
                Click to upload PNG, JPG, SVG, or PDF
              </span>
            </>
          )}
        </label>
        {artworkUrl && !uploading ? (
          <p className="text-xs text-ui-fg-muted">
            Artwork saved. Our team will use this for all embroidered and printed items.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-y-2">
        <label className="text-sm font-medium text-ui-fg-base">
          Decoration notes <span className="font-normal text-ui-fg-muted">(optional)</span>
        </label>
        <textarea
          value={decorationNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="e.g. Left chest embroidery on polos, front print on t-shirts, cap front embroidery. Logo should be max 80mm wide."
          className="rounded-xl border border-ui-border-base bg-ui-bg-base px-4 py-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted resize-none focus:outline-none focus:ring-1 focus:ring-ui-border-interactive"
        />
        <p className="text-xs text-ui-fg-muted">
          Tell us where you&apos;d like each decoration placed and any size or colour preferences.
          Our team will follow up if we need more detail.
        </p>
      </div>

      <div className="flex items-center gap-x-3">
        <button
          onClick={onBack}
          className="rounded-full border border-ui-border-base px-5 py-2 text-sm text-ui-fg-base hover:bg-ui-bg-subtle transition"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={uploading}
          className="rounded-full bg-ui-fg-base px-6 py-2 text-sm font-medium text-ui-bg-base transition hover:opacity-90 disabled:opacity-40"
        >
          Review order →
        </button>
      </div>
    </div>
  )
}

function ReviewStep({
  bundle,
  items,
  productConfigs,
  products,
  multiplier,
  artworkUrl,
  decorationNotes,
  addingToCart,
  cartError,
  onBack,
  onAddToCart,
}: {
  bundle: BundleWithProducts
  items: BundleItem[]
  productConfigs: ProductConfig[]
  products: Array<BundleProduct | null>
  multiplier: number
  artworkUrl: string | null
  decorationNotes: string
  addingToCart: boolean
  cartError: string | null
  onBack: () => void
  onAddToCart: () => void
}) {
  const linesByItem = items.map((item, i) =>
    linesForItem(products[i], productConfigs[i], item, multiplier)
  )
  const hasAnyQty = linesByItem.some((lines) => lines.length > 0)
  const hasProductsWithNoConfig = products.some((p) => !p)
  const isFullPack = linesByItem.every((lines) => lines.length > 0)

  const totalQty = linesByItem.flat().reduce((acc, l) => acc + l.quantity, 0)

  return (
    <div className="flex flex-col gap-y-6">
      <h2 className="text-xl font-semibold text-ui-fg-base">Review your order</h2>

      <div className="flex flex-col gap-y-3">
        {items.map((item, i) => {
          const cfg = productConfigs[i]
          const product = products[i]
          const sizes = Object.entries(cfg.sizeQtys).filter(([, q]) => q > 0)

          return (
            <div
              key={i}
              className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4"
            >
              <div className="flex items-start justify-between gap-x-3">
                <div>
                  <p className="font-medium text-ui-fg-base text-sm">{item.label}</p>
                  {product ? (
                    <p className="text-xs text-ui-fg-muted mt-0.5">{product.title}</p>
                  ) : (
                    <p className="text-xs text-ui-fg-muted mt-0.5">
                      Details to be confirmed by our team
                    </p>
                  )}
                </div>
                <span className="text-xs text-ui-fg-muted text-right">
                  {describePositions(item)}
                </span>
              </div>

              {linesByItem[i].length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {cfg.selectedColor ? (
                    <span className="text-xs text-ui-fg-subtle">
                      Colour: <strong className="text-ui-fg-base">{cfg.selectedColor}</strong>
                    </span>
                  ) : null}
                  {sizes.length > 0 ? (
                    <span className="text-xs text-ui-fg-subtle">
                      Sizes: {sizes.map(([s, q]) => `${s}×${q}`).join(", ")}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-ui-fg-muted">No selection — will be handled by our team.</p>
              )}
            </div>
          )
        })}
      </div>

      {artworkUrl ? (
        <div className="flex items-center gap-x-3 rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4">
          <img
            src={artworkUrl}
            alt="Uploaded artwork"
            className="h-14 w-14 rounded-md object-contain border border-ui-border-base bg-white"
          />
          <p className="text-sm text-ui-fg-base">Artwork uploaded</p>
        </div>
      ) : null}

      {decorationNotes ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4">
          <p className="text-xs font-medium text-ui-fg-muted mb-1">Decoration notes</p>
          <p className="text-sm text-ui-fg-base whitespace-pre-line">{decorationNotes}</p>
        </div>
      ) : null}

      {totalQty > 0 ? (
        <div className="flex flex-col gap-y-1">
          <p className="text-sm text-ui-fg-subtle">
            Total items being added to cart: <strong className="text-ui-fg-base">{totalQty}</strong>
          </p>
          <p className="text-xs text-ui-fg-muted">
            Your cart shows the full price for each item, including printing and embroidery.
          </p>
          {bundle.discount_pct ? (
            <p className="text-sm font-medium text-ui-fg-base">
              {isFullPack
                ? `Full pack: ${bundle.discount_pct}% off is applied in your cart.`
                : `Add every item in the pack to save ${bundle.discount_pct}%.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasProductsWithNoConfig ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4">
          <p className="text-sm text-ui-fg-subtle">
            Some items in this bundle will be handled by our team during production.
            We&apos;ll reach out after your order to confirm details.
          </p>
        </div>
      ) : null}

      {cartError ? (
        <p className="rounded-xl border border-ui-tag-red-border bg-ui-tag-red-bg px-4 py-3 text-sm text-ui-tag-red-text">
          {cartError}
        </p>
      ) : null}

      <div className="flex items-center gap-x-3">
        <button
          onClick={onBack}
          disabled={addingToCart}
          className="rounded-full border border-ui-border-base px-5 py-2 text-sm text-ui-fg-base hover:bg-ui-bg-subtle transition disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={onAddToCart}
          disabled={addingToCart || (!hasAnyQty && !hasProductsWithNoConfig)}
          className="rounded-full bg-ui-fg-base px-6 py-2.5 text-sm font-medium text-ui-bg-base transition hover:opacity-90 disabled:opacity-40"
        >
          {addingToCart ? "Adding to cart…" : "Add to cart"}
        </button>
      </div>
    </div>
  )
}

/**
 * Team packs: instead of entering every size, the organiser shares a link and
 * each person picks their own sizes. Converts into this same priced pack.
 */
function TeamOrderPanel({
  bundle,
  missingColour,
  onCreate,
}: {
  bundle: BundleWithProducts
  missingColour: string[]
  onCreate: (title: string, email: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [title, setTitle] = useState(bundle.title)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (missingColour.length) {
      setError(`Choose a colour for ${missingColour.join(", ")} first.`)
      return
    }
    if (!title.trim() || !email.trim()) {
      setError("Add a name for the order and your email.")
      return
    }
    setBusy(true)
    setError(null)
    const res = await onCreate(title.trim(), email.trim())
    if (!res.ok) setError(res.error)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-ui-border-base bg-ui-bg-subtle p-5">
      <div>
        <p className="text-sm font-semibold text-ui-fg-base">Ordering for a team?</p>
        <p className="mt-1 text-xs text-ui-fg-subtle">
          Skip the size spreadsheet. Share one link and everyone picks their own sizes for this pack. You
          convert it to a single order when everyone&rsquo;s in. Your colours and artwork above are kept.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 small:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Under 12s kit 2027"
          className="min-h-11 rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-sm"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="min-h-11 rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-sm"
        />
      </div>
      {error ? (
        <p className="text-sm text-ui-tag-red-text">
          {error}{" "}
          {/sign in/i.test(error) ? (
            <LocalizedClientLink href="/account" className="underline">
              Sign in
            </LocalizedClientLink>
          ) : null}
        </p>
      ) : null}
      <button
        onClick={submit}
        disabled={busy}
        className="self-start min-h-11 rounded-full border border-ui-border-base bg-ui-bg-base px-5 text-sm font-medium text-ui-fg-base transition hover:bg-ui-bg-subtle-hover disabled:opacity-40"
      >
        {busy ? "Creating link…" : "Create a team size link"}
      </button>
    </div>
  )
}
