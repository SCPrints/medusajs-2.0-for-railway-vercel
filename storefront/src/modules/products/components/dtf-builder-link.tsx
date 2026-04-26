"use client"

import { useMemo } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useProductOptions } from "@modules/products/context/product-options-context"
import { resolveVariantFromOptions } from "@modules/products/lib/variant-options"
import { HttpTypes } from "@medusajs/types"

type Props = {
  product: HttpTypes.StoreProduct
  className?: string
}

export default function DtfBuilderLink({ product, className }: Props) {
  const { options } = useProductOptions()

  const selectedVariant = useMemo(() => {
    if (!product.variants?.length) {
      return undefined
    }
    return resolveVariantFromOptions(product, options)
  }, [product, options])

  const href =
    selectedVariant?.id != null
      ? `/dtf-builder?variantId=${encodeURIComponent(selectedVariant.id)}`
      : "/dtf-builder"

  return (
    <LocalizedClientLink href={href} className={className}>
      Create gang sheet
    </LocalizedClientLink>
  )
}
