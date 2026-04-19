"use client"

import { createContext, useContext, useMemo, useState } from "react"

type ProductOptionsContextValue = {
  options: Record<string, string | undefined>
  setOptionValue: (title: string, value: string) => void
}

const ProductOptionsContext = createContext<ProductOptionsContextValue | null>(null)

export const ProductOptionsProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [options, setOptions] = useState<Record<string, string | undefined>>({})

  const value = useMemo<ProductOptionsContextValue>(
    () => ({
      options,
      setOptionValue: (title, value) => {
        setOptions((prev) => ({
          ...prev,
          [title]: value,
        }))
      },
    }),
    [options]
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
