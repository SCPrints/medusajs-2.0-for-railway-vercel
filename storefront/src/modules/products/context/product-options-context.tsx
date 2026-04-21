"use client"

import type { HttpTypes } from "@medusajs/types"
import { getDefaultProductOptions } from "@modules/products/lib/variant-options"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

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
  const [options, setOptions] = useState<Record<string, string | undefined>>(() =>
    getDefaultProductOptions(product)
  )
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>(() =>
    buildEmptySizeQuantities(product)
  )

  useEffect(() => {
    setSizeQuantities(buildEmptySizeQuantities(product))
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
      sizeQuantities,
      setSizeQuantity,
    }),
    [options, setOptionValue, sizeQuantities, setSizeQuantity]
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
