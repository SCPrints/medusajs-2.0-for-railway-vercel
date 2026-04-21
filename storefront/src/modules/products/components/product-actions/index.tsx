"use client"

import { Button } from "@medusajs/ui"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

import Divider from "@modules/common/components/divider"
import {
  extractRenderArtifactUrl,
  normalizePersistedArtifactUrl,
} from "@modules/customizer/lib/artifact-url"
import { resolveGarmentImageUrlForCustomizerRender } from "@modules/customizer/lib/garment-url-for-render"
import ProductOptionFields from "@modules/products/components/product-actions/product-option-fields"
import { usePrintPlacement } from "@modules/products/context/print-placement-context"
import { useProductOptions } from "@modules/products/context/product-options-context"
import {
  getPrimaryGarmentImageUrl,
  resolveVariantFromOptions,
} from "@modules/products/lib/variant-options"

import ProductPrice from "../product-price"
import { addToCartSafe } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const DEFAULT_RENDER_SURFACE = {
  width: 1200,
  height: 1500,
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

export default function ProductActions({
  product,
  region,
  disabled,
}: ProductActionsProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [addToCartError, setAddToCartError] = useState<string | null>(null)
  const countryCode = useParams().countryCode as string
  const { overlayUrl, overlayFileName, placement } = usePrintPlacement()
  const { options, setOptionValue } = useProductOptions()

  const selectedVariant = useMemo(
    () => resolveVariantFromOptions(product, options),
    [product, options]
  )

  const renderPlacementArtifacts = async (artworkUrl: string) => {
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

    const placementWidth = Math.max(
      1,
      Math.round((renderSurface.width * placement.widthPct) / 100)
    )
    const placementHeight = Math.max(
      1,
      Math.round((renderSurface.height * placement.heightPct) / 100)
    )
    const payload = {
      side: placement.side,
      artworkSvg: buildArtworkSvg(
        artworkUrl,
        overlayDimensions?.width ?? placementWidth,
        overlayDimensions?.height ?? placementHeight
      ),
      garmentImageUrl,
      placement: {
        x: Math.max(0, Math.round((renderSurface.width * placement.xPct) / 100)),
        y: Math.max(0, Math.round((renderSurface.height * placement.yPct) / 100)),
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

    const printPlacementMetadata: Record<string, unknown> | undefined = overlayUrl
      ? {
          printPlacement: {
            version: 1,
            placement,
            sourceFileName: overlayFileName,
          },
        }
      : undefined

    if (overlayUrl) {
      try {
        const artifacts = await renderPlacementArtifacts(overlayUrl)
        if (artifacts.mockupUrl || artifacts.printUrl) {
          const existingDesign =
            (printPlacementMetadata?.customizerDesign as Record<string, unknown> | undefined) ?? {}
          printPlacementMetadata.customizerDesign = {
            ...existingDesign,
            version: 1,
            type: "pdp_print_placement",
            artifacts: [
              {
                side: placement.side,
                printUrl: artifacts.printUrl,
                mockupUrl: artifacts.mockupUrl,
              },
            ],
          }
        }
      } catch (error) {
        console.warn("Could not render print-placement artifacts for cart preview", error)
      }
    }

    const addResult = await addToCartSafe({
        variantId: selectedVariant.id,
        quantity: 1,
        countryCode,
        metadata: printPlacementMetadata,
    })
    if (!addResult.ok) {
      setAddToCartError(addResult.error)
    }
    setIsAdding(false)
  }

  return (
    <>
      <div className="flex flex-col gap-y-2">
        <div>
          {(product.variants?.length ?? 0) > 1 && (
            <div className="flex flex-col gap-y-4">
              <ProductOptionFields
                product={product}
                options={options}
                updateOption={setOptionValue}
                disabled={!!disabled || isAdding}
                data-testid="product-options"
              />
              <Divider />
            </div>
          )}
        </div>

        <ProductPrice product={product} variant={selectedVariant} />

        <Button
          onClick={handleAddToCart}
          disabled={!inStock || !selectedVariant || !!disabled || isAdding}
          variant="primary"
          className="w-full h-10"
          isLoading={isAdding}
          data-testid="add-product-button"
        >
          {!selectedVariant
            ? "Select variant"
            : !inStock
            ? "Out of stock"
            : "Add to cart"}
        </Button>
        {addToCartError ? (
          <p className="txt-small text-rose-600" role="alert">
            {addToCartError}
          </p>
        ) : null}
      </div>
    </>
  )
}
