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
  /** Temporary colour for PDP main image (hover on swatch); does not change cart selection. */
  colorHoverPreview: string | null
  setColorHoverPreview: (value: string | null) => void
  /** Quantity per size label (customizer + multi-size cart). Keys match size option values. */
  sizeQuantities: Record<string, number>
  setSizeQuantity: (size: string, quantity: number) => void
}

const ProductOptionsContext = createContext<ProductOptionsContextValue | null>(null)

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
      colorHoverPreview,
      setColorHoverPreview,
      sizeQuantities,
      setSizeQuantity,
    }),
    [options, setOptionValue, colorHoverPreview, sizeQuantities, setSizeQuantity]
  )

  return (
    <ProductOptionsContext.Provider value={value}>{children}</ProductOptionsContext.Provider>
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
