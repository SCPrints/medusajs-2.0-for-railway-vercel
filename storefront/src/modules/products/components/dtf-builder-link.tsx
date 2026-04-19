"use client"

import { isEqual } from "lodash"
import { useMemo } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useProductOptions } from "@modules/products/context/product-options-context"
import { HttpTypes } from "@medusajs/types"

type Props = {
  product: HttpTypes.StoreProduct
  className?: string
}

const optionsAsKeymap = (variantOptions: HttpTypes.StoreProductVariant["options"]) => {
  return variantOptions?.reduce((acc: Record<string, string | undefined>, varopt: any) => {
    if (varopt.option && varopt.value !== null && varopt.value !== undefined) {
      acc[varopt.option.title] = varopt.value
    }
    return acc
  }, {})
}

export default function DtfBuilderLink({ product, className }: Props) {
  const { options } = useProductOptions()

  const selectedVariant = useMemo(() => {
    if (!product.variants?.length) {
      return undefined
    }

    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

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
