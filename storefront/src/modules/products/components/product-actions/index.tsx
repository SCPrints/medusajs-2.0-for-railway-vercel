"use client"

import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

import Divider from "@modules/common/components/divider"
import FlyToCartAddButton, {
  resolvePdpFlyImageSrc,
} from "@modules/common/components/fly-to-cart-add-button"
import {
  extractRenderArtifactUrl,
  normalizePersistedArtifactUrl,
} from "@modules/customizer/lib/artifact-url"
import { resolveGarmentImageUrlForCustomizerRender } from "@modules/customizer/lib/garment-url-for-render"
import ProductOptionFields from "@modules/products/components/product-actions/product-option-fields"
import {
  buildPlacementForSideAndSize,
  type PrintPlacement,
  type PrintPlacementSide,
  usePrintPlacement,
} from "@modules/products/context/print-placement-context"
import { useProductOptions } from "@modules/products/context/product-options-context"
import {
  getPrimaryGarmentImageUrl,
  resolveVariantFromOptions,
} from "@modules/products/lib/variant-options"

import ProductPrice from "../product-price"
import { addScpLineItemToCartSafe, addToCartSafe } from "@lib/data/cart"
import {
  DEFAULT_SCP_PRINT_SIZE_ID,
  SCP_PRINT_SIZE_OPTIONS,
  resolveScpPrintSizeForSide,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"
import { HttpTypes } from "@medusajs/types"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
  hideInlinePurchaseControls?: boolean
}

const DEFAULT_RENDER_SURFACE = {
  width: 1200,
  height: 1500,
}

const PDP_LOCATION_OPTIONS: Array<{ side: PrintPlacementSide; label: string }> = [
  { side: "front", label: "Front" },
  { side: "back", label: "Back" },
  { side: "left_sleeve", label: "Left sleeve" },
  { side: "right_sleeve", label: "Right sleeve" },
  { side: "printed_tag", label: "Printed tag" },
]

const productMetadataUsesScpCartPricing = (p: HttpTypes.StoreProduct) => {
  const m = p.metadata as Record<string, unknown> | undefined
  return m?.use_scp_dtf_cart_pricing === true
}

const variantHasConfiguredPrice = (variant?: HttpTypes.StoreProductVariant) => {
  const variantRecord = variant as any
  if (typeof variantRecord?.calculated_price?.calculated_amount === "number") {
    return true
  }
  return Array.isArray(variantRecord?.prices)
    ? variantRecord.prices.some((price: any) => typeof price?.amount === "number")
    : false
}

const resolveImageDimensions = (url: string) =>
  new Promise<{ width: number; height: number } | null>((resolve) => {
    if (typeof window === "undefined") {
      resolve(null)
      return
    }

    const image = new window.Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth || DEFAULT_RENDER_SURFACE.width,
        height: image.naturalHeight || DEFAULT_RENDER_SURFACE.height,
      })
    }
    image.onerror = () => resolve(null)
    image.src = url
  })

const escapeXmlAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

const buildArtworkSvg = (artworkUrl: string, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const safeUrl = escapeXmlAttribute(artworkUrl)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><image href="${safeUrl}" x="0" y="0" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="xMidYMid meet" /></svg>`
}

const clampPlacementToSize = (
  side: PrintPlacementSide,
  sizeId: ScpPrintSizeId,
  current: PrintPlacement
): PrintPlacement => {
  const sizeForSide = resolveScpPrintSizeForSide(side, sizeId)
  const preset = buildPlacementForSideAndSize(side, sizeForSide)
  const widthPct = Math.min(current.widthPct, preset.widthPct)
  const heightPct = Math.min(current.heightPct, preset.heightPct)
  const xPct = Math.min(Math.max(0, current.xPct), 100 - widthPct)
  const yPct = Math.min(Math.max(0, current.yPct), 100 - heightPct)
  return {
    ...current,
    side,
    xPct,
    yPct,
    widthPct,
    heightPct,
  }
}

export default function ProductActions({
  product,
  region,
  disabled,
  hideInlinePurchaseControls = false,
}: ProductActionsProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [pdpGuideExpanded, setPdpGuideExpanded] = useState(true)
  const [addToCartError, setAddToCartError] = useState<string | null>(null)
  const countryCode = useParams().countryCode as string
  const {
    overlayUrl,
    overlayFileName,
    selections,
    activeSelectionId,
    activeSelection,
    setActiveSelectionId,
    upsertSelectionForSide,
    removeSelectionsForSide,
    setSelectionPrintSize,
  } = usePrintPlacement()
  const { options, setOptionValue } = useProductOptions()
  const scpPrintSizeId = activeSelection?.printSizeId ?? DEFAULT_SCP_PRINT_SIZE_ID

  const selectedVariant = useMemo(
    () => resolveVariantFromOptions(product, options),
    [product, options]
  )

  const hasVisibleProductOptions = useMemo(() => {
    if ((product.variants?.length ?? 0) <= 1) {
      return false
    }
    const opts = product.options ?? []
    if (!hideInlinePurchaseControls) {
      return opts.length > 0
    }
    return opts.some((o) => !(o.title ?? "").toLowerCase().includes("size"))
  }, [product.variants?.length, product.options, hideInlinePurchaseControls])

  const renderPlacementArtifacts = async (
    artworkUrl: string,
    selection: {
      side: PrintPlacementSide
      printSizeId: ScpPrintSizeId
      placement: PrintPlacement
    }
  ) => {
    const overlayDimensions = await resolveImageDimensions(artworkUrl)
    const garmentCandidateUrl = getPrimaryGarmentImageUrl(product, selectedVariant)
    const garmentImageUrl = resolveGarmentImageUrlForCustomizerRender(
      garmentCandidateUrl,
      product.thumbnail ?? null
    )
    const garmentDimensions = garmentImageUrl
      ? await resolveImageDimensions(garmentImageUrl)
      : null
    const renderSurface = garmentDimensions ?? DEFAULT_RENDER_SURFACE

    const clampedPlacement = clampPlacementToSize(
      selection.side,
      selection.printSizeId,
      selection.placement
    )
    const placementWidth = Math.max(
      1,
      Math.round((renderSurface.width * clampedPlacement.widthPct) / 100)
    )
    const placementHeight = Math.max(
      1,
      Math.round((renderSurface.height * clampedPlacement.heightPct) / 100)
    )
    const payload = {
      side: selection.side,
      artworkSvg: buildArtworkSvg(
        artworkUrl,
        overlayDimensions?.width ?? placementWidth,
        overlayDimensions?.height ?? placementHeight
      ),
      garmentImageUrl,
      placement: {
        x: Math.max(0, Math.round((renderSurface.width * clampedPlacement.xPct) / 100)),
        y: Math.max(0, Math.round((renderSurface.height * clampedPlacement.yPct) / 100)),
        width: placementWidth,
        height: placementHeight,
      },
    }

    const [printResponse, mockupResponse] = await Promise.all([
      fetch("/api/customizer/render-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      fetch("/api/customizer/render-mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ])

    const printBody = await printResponse.json().catch(() => ({}))
    const mockupBody = await mockupResponse.json().catch(() => ({}))

    if (!printResponse.ok || !mockupResponse.ok) {
      const detail = [printBody?.message, mockupBody?.message]
        .filter((part) => typeof part === "string" && part.length > 0)
        .join(" - ")
      throw new Error(
        detail || `Render failed (print ${printResponse.status}, mockup ${mockupResponse.status})`
      )
    }

    const printUrl =
      extractRenderArtifactUrl(printBody) ??
      extractRenderArtifactUrl((printBody as { data?: unknown }).data)
    const mockupUrl =
      extractRenderArtifactUrl(mockupBody) ??
      extractRenderArtifactUrl((mockupBody as { data?: unknown }).data)

    return {
      side: selection.side,
      printSizeId: resolveScpPrintSizeForSide(selection.side, selection.printSizeId),
      placement: clampedPlacement,
      printUrl: normalizePersistedArtifactUrl(printUrl),
      mockupUrl: normalizePersistedArtifactUrl(mockupUrl),
    }
  }

  // check if the selected variant is in stock
  const inStock = useMemo(() => {
    // If we don't manage inventory, we can always add to cart
    if (selectedVariant && !selectedVariant.manage_inventory) {
      return true
    }

    // If we allow back orders on the variant, we can add to cart
    if (selectedVariant?.allow_backorder) {
      return true
    }

    // If there is inventory available, we can add to cart
    if (
      selectedVariant?.manage_inventory &&
      (selectedVariant?.inventory_quantity || 0) > 0
    ) {
      return true
    }

    // Otherwise, we can't add to cart
    return false
  }, [selectedVariant])

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)
    setAddToCartError(null)

    if (!variantHasConfiguredPrice(selectedVariant)) {
      setAddToCartError("This variant is unavailable in the selected region.")
      setIsAdding(false)
      return
    }

    const hasPdpSelections = selections.length > 0
    const selectedLocations = hasPdpSelections
      ? selections
      : [
          {
            id: "fallback_front",
            side: "front" as PrintPlacementSide,
            printSizeId: scpPrintSizeId,
            placement: buildPlacementForSideAndSize("front", scpPrintSizeId),
          },
        ]

    const printPlacementMetadata: Record<string, unknown> | undefined = overlayUrl
      ? {
          printPlacement: {
            version: 2,
            placement: selectedLocations[0]?.placement,
            sourceFileName: overlayFileName,
          },
        }
      : undefined

    if (overlayUrl && printPlacementMetadata) {
      try {
        const artifacts = await Promise.all(
          selectedLocations.map((selection) => renderPlacementArtifacts(overlayUrl, selection))
        )
        if (artifacts.some((artifact) => artifact.mockupUrl || artifact.printUrl)) {
          const existingDesign =
            (printPlacementMetadata?.customizerDesign as Record<string, unknown> | undefined) ?? {}
          printPlacementMetadata.customizerDesign = {
            ...existingDesign,
            version: 1,
            type: "pdp_print_placement",
            artifacts: artifacts.map((artifact) => ({
              side: artifact.side,
              print_size_id: artifact.printSizeId,
              placement: artifact.placement,
              printUrl: artifact.printUrl,
              mockupUrl: artifact.mockupUrl,
            })),
            pdpSelections: selectedLocations.map((selection) => ({
              side: selection.side,
              print_size_id: resolveScpPrintSizeForSide(selection.side, selection.printSizeId),
            })),
          }
        }
      } catch (error) {
        console.warn("Could not render print-placement artifacts for cart preview", error)
      }
    }

    const shouldUseScpCart =
      productMetadataUsesScpCartPricing(product) && Boolean(overlayUrl && printPlacementMetadata)

    if (shouldUseScpCart && !selectedLocations.length) {
      setAddToCartError("Please select at least one print location.")
      setIsAdding(false)
      return
    }

    const addResult = shouldUseScpCart
      ? await addScpLineItemToCartSafe({
          variantId: selectedVariant.id,
          quantity,
          countryCode,
          printSizeId: selectedLocations[0]?.printSizeId ?? scpPrintSizeId,
          metadata: printPlacementMetadata,
        })
      : await addToCartSafe({
          variantId: selectedVariant.id,
          quantity,
          countryCode,
          metadata: printPlacementMetadata,
        })
    if (!addResult.ok) {
      setAddToCartError(addResult.error)
    }
    setIsAdding(false)
  }

  const updateQuantity = (nextQuantity: number) => {
    if (!Number.isFinite(nextQuantity)) {
      return
    }
    const sanitized = Math.min(999, Math.max(1, Math.floor(nextQuantity)))
    setQuantity(sanitized)
  }

  return (
    <>
      <div className="flex flex-col gap-y-2">
        <div>
          {hasVisibleProductOptions && (
            <div className="flex flex-col gap-y-4">
              <ProductOptionFields
                product={product}
                options={options}
                updateOption={setOptionValue}
                disabled={!!disabled || isAdding}
                hideSizeOption={!!hideInlinePurchaseControls}
                data-testid="product-options"
              />
              {!hideInlinePurchaseControls ? <Divider /> : null}
            </div>
          )}
        </div>

        {!hideInlinePurchaseControls ? (
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="product-quantity" className="text-sm font-medium text-ui-fg-base">
              Quantity
            </label>
            <div className="flex items-center border rounded-md border-ui-border-base">
              <button
                type="button"
                className="px-3 py-2 text-ui-fg-muted disabled:opacity-40"
                onClick={() => updateQuantity(quantity - 1)}
                disabled={quantity <= 1 || isAdding || !!disabled}
                aria-label="Decrease quantity"
                data-no-squish
              >
                -
              </button>
              <input
                id="product-quantity"
                type="number"
                min={1}
                max={999}
                value={quantity}
                onChange={(event) => updateQuantity(Number.parseInt(event.target.value, 10))}
                className="w-16 border-x border-ui-border-base py-2 text-center text-sm outline-none"
                disabled={isAdding || !!disabled}
              />
              <button
                type="button"
                className="px-3 py-2 text-ui-fg-muted disabled:opacity-40"
                onClick={() => updateQuantity(quantity + 1)}
                disabled={quantity >= 999 || isAdding || !!disabled}
                aria-label="Increase quantity"
                data-no-squish
              >
                +
              </button>
            </div>
          </div>
        ) : null}

        {!hideInlinePurchaseControls &&
        overlayUrl &&
        productMetadataUsesScpCartPricing(product) ? (
          <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle/40 p-3 space-y-3">
            <button
              type="button"
              className="text-xs font-medium text-ui-fg-subtle underline underline-offset-2"
              onClick={() => setPdpGuideExpanded((prev) => !prev)}
            >
              {pdpGuideExpanded ? "Hide guide" : "Show guide"}
            </button>
            {pdpGuideExpanded ? (
              <ol className="list-decimal pl-4 text-xs text-ui-fg-subtle space-y-1">
                <li>Select one or more print locations.</li>
                <li>Choose a print size for the active location.</li>
                <li>Upload artwork and add to cart.</li>
                <li>Sleeves + printed tag are always priced at A6.</li>
              </ol>
            ) : null}

            <div className="space-y-1">
              <p className="text-sm font-medium text-ui-fg-base">Print locations</p>
              <div className="grid grid-cols-2 gap-2">
                {PDP_LOCATION_OPTIONS.map((entry) => {
                  const exists = selections.some((selection) => selection.side === entry.side)
                  return (
                    <button
                      key={entry.side}
                      type="button"
                      onClick={() => {
                        if (exists) {
                          removeSelectionsForSide(entry.side)
                        } else {
                          upsertSelectionForSide(entry.side, scpPrintSizeId)
                        }
                      }}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium text-left ${
                        exists
                          ? "border-ui-border-interactive bg-ui-bg-base text-ui-fg-base"
                          : "border-ui-border-base text-ui-fg-subtle"
                      }`}
                    >
                      {entry.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="pdp-scp-print-size" className="text-sm font-medium text-ui-fg-base">
                Print size for active location
              </label>
              <select
                id="pdp-scp-print-size"
                value={scpPrintSizeId}
                onChange={(event) => {
                  if (!activeSelectionId) return
                  setSelectionPrintSize(activeSelectionId, event.target.value as ScpPrintSizeId)
                }}
                disabled={isAdding || !!disabled || !activeSelectionId}
                className="w-full rounded-rounded border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base outline-none focus:border-ui-border-interactive"
              >
                {SCP_PRINT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({opt.dimensionsLabel})
                  </option>
                ))}
              </select>
            </div>

            {selections.length ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-ui-fg-subtle">Selected locations</p>
                <div className="flex flex-wrap gap-2">
                  {selections.map((selection) => (
                    <button
                      key={selection.id}
                      type="button"
                      onClick={() => setActiveSelectionId(selection.id)}
                      className={`rounded-full border px-2 py-1 text-xs ${
                        activeSelectionId === selection.id
                          ? "border-ui-border-interactive text-ui-fg-base"
                          : "border-ui-border-base text-ui-fg-subtle"
                      }`}
                    >
                      {selection.side.replace(/_/g, " ")} •{" "}
                      {resolveScpPrintSizeForSide(selection.side, selection.printSizeId)
                        .replace("up_to_", "")
                        .toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!hideInlinePurchaseControls ? (
          <ProductPrice product={product} variant={selectedVariant} quantity={quantity} />
        ) : null}

        {!hideInlinePurchaseControls ? (
          <FlyToCartAddButton
            onAddToCart={() => {
              void handleAddToCart()
            }}
            disabled={!inStock || !selectedVariant || !!disabled || isAdding}
            isLoading={isAdding}
            className="w-full h-10"
            data-testid="add-product-button"
            flyImageSrc={resolvePdpFlyImageSrc(product, selectedVariant)}
          >
            {!selectedVariant
              ? "Select variant"
              : !inStock
              ? "Out of stock"
              : "Add to cart"}
          </FlyToCartAddButton>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return
              const target = document.getElementById("product-customizer")
              if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" })
                const focusable = target.querySelector<HTMLElement>(
                  "input, button, [tabindex]:not([tabindex='-1'])"
                )
                focusable?.focus({ preventScroll: true })
              }
            }}
            disabled={!!disabled}
            className="w-full h-10 rounded-rounded bg-ui-button-inverted text-ui-fg-on-inverted text-small-regular hover:bg-ui-button-inverted-hover disabled:opacity-50"
            data-testid="customize-product-button"
          >
            Customize this product
          </button>
        )}
        {addToCartError ? (
          <p className="txt-small text-rose-600" role="alert">
            {addToCartError}
          </p>
        ) : null}
      </div>
    </>
  )
}
