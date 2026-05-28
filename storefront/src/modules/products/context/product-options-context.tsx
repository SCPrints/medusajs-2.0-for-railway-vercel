"use client"

import type { HttpTypes } from "@medusajs/types"
import { getDefaultProductOptions } from "@modules/products/lib/variant-options"
import { useSearchParams } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

/** Build the option-key map for a specific variant id, falling back to product defaults. */
const buildOptionsForVariantId = (
  product: HttpTypes.StoreProduct,
  variantId: string | null | undefined
): Record<string, string | undefined> => {
  const defaults = getDefaultProductOptions(product)
  if (!variantId) {
    return defaults
  }
  const variant = product.variants?.find((v) => v.id === variantId)
  if (!variant) {
    return defaults
  }
  const next: Record<string, string | undefined> = { ...defaults }
  for (const opt of variant.options ?? []) {
    const title = (opt as any)?.option?.title as string | undefined
    const value = (opt as any)?.value as string | undefined
    if (title && typeof value === "string") {
      next[title] = value
    }
  }
  return next
}

const buildEmptySizeQuantities = (product: HttpTypes.StoreProduct): Record<string, number> => {
  const sizeOpt = product.options?.find((o) => (o.title ?? "").toLowerCase().includes("size"))
  const out: Record<string, number> = {}
  for (const v of sizeOpt?.values ?? []) {
    const val = v.value
    if (typeof val === "string" && val.length > 0) {
      out[val] = 0
    }
  }
  return out
}

type ProductOptionsContextValue = {
  options: Record<string, string | undefined>
  setOptionValue: (title: string, value: string) => void
  /**
   * Setter for the temporary swatch-hover colour preview. Kept on this context
   * (not the hover-value context) because a `useState` setter has a stable
   * identity — so hover changes never invalidate this value object and never
   * re-render its consumers (OptionSelect, the customizer template). The hover
   * *value* lives in a separate context below so only the gallery re-renders.
   */
  setColorHoverPreview: (value: string | null) => void
  /** Quantity per size label (customizer + multi-size cart). Keys match size option values. */
  sizeQuantities: Record<string, number>
  setSizeQuantity: (size: string, quantity: number) => void
}

const ProductOptionsContext = createContext<ProductOptionsContextValue | null>(null)

/**
 * Hover-preview colour is isolated in its own context so that sweeping the
 * mouse across a colour-swatch row only re-renders the image gallery — not the
 * ~5000-line customizer template or the swatch list itself. Previously this
 * value lived on the ProductOptions value object, so every `onPointerEnter`
 * created a new context value and re-rendered every consumer.
 */
type ColorHoverContextValue = {
  colorHoverPreview: string | null
}

const ColorHoverContext = createContext<ColorHoverContextValue | null>(null)

export const ProductOptionsProvider = ({
  children,
  product,
}: {
  children: React.ReactNode
  product: HttpTypes.StoreProduct
}) => {
  // Seed from `?variant=<id>` (e.g. when returning to the PDP from the cart)
  // so the colour/size pickers reflect the previously chosen variant.
  const initialSearchParams = useSearchParams()
  const initialVariantIdFromUrl = initialSearchParams?.get("variant") ?? null
  const [options, setOptions] = useState<Record<string, string | undefined>>(() =>
    buildOptionsForVariantId(product, initialVariantIdFromUrl)
  )
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>(() =>
    buildEmptySizeQuantities(product)
  )
  const [colorHoverPreview, setColorHoverPreview] = useState<string | null>(null)

  useEffect(() => {
    setSizeQuantities(buildEmptySizeQuantities(product))
  }, [product.id])

  useEffect(() => {
    setColorHoverPreview(null)
  }, [product.id])

  const setOptionValue = useCallback((title: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [title]: value,
    }))
  }, [])

  const setSizeQuantity = useCallback((size: string, quantity: number) => {
    const q = Math.max(0, Math.floor(Math.min(999, Number.isFinite(quantity) ? quantity : 0)))
    setSizeQuantities((prev) => ({
      ...prev,
      [size]: q,
    }))
  }, [])

  const value = useMemo<ProductOptionsContextValue>(
    () => ({
      options,
      setOptionValue,
      setColorHoverPreview,
      sizeQuantities,
      setSizeQuantity,
    }),
    [options, setOptionValue, setColorHoverPreview, sizeQuantities, setSizeQuantity]
  )

  // Separate value object so only ColorHoverContext consumers (the gallery)
  // re-render when the hover preview changes — not every ProductOptions consumer.
  const hoverValue = useMemo<ColorHoverContextValue>(
    () => ({ colorHoverPreview }),
    [colorHoverPreview]
  )

  return (
    <ProductOptionsContext.Provider value={value}>
      <ColorHoverContext.Provider value={hoverValue}>{children}</ColorHoverContext.Provider>
    </ProductOptionsContext.Provider>
  )
}

export const useProductOptions = () => {
  const context = useContext(ProductOptionsContext)

  if (!context) {
    throw new Error("useProductOptions must be used within ProductOptionsProvider")
  }

  return context
}

/** For components that may render outside a provider (e.g. standalone customizer). */
export const useProductOptionsOptional = () => useContext(ProductOptionsContext)

/**
 * Colour hover-preview value (swatch hover). Isolated from ProductOptions so
 * hovering swatches only re-renders this context's consumers (the image
 * gallery). Returns null outside a provider so ImageGallery stays safe when
 * rendered in non-PDP contexts.
 */
export const useColorHover = (): string | null =>
  useContext(ColorHoverContext)?.colorHoverPreview ?? null
