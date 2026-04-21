"use client"

import { useMemo, type ReactNode } from "react"
import { isEqual } from "lodash"
import { HttpTypes } from "@medusajs/types"

import { extractDefaultGarmentFromProduct } from "@modules/customizer/lib/default-garment"
import { useProductOptions } from "@modules/products/context/product-options-context"
import { optionsAsKeymap } from "@modules/products/lib/variant-options"
import CustomizerTemplate from "@modules/customizer/templates"

type Props = {
  product: HttpTypes.StoreProduct
  /** When set, gallery and variant pickers sit in the same grid as the design canvas (unified PDP layout). */
  integratedPdpSlots?: {
    gallery: ReactNode
    variantPickers: ReactNode
  }
}

/**
 * Logo customizer on the PDP: variant selection can live in `integratedPdpSlots.variantPickers`
 * so it aligns with ProductActions; canvas shows the garment mockup for the synced variant.
 */
export default function EmbeddedProductCustomizer({ product, integratedPdpSlots }: Props) {
  const { options } = useProductOptions()

  const matchedVariant = useMemo(() => {
    if (!product.variants?.length) {
      return undefined
    }
    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  const syncVariantId = matchedVariant?.id ?? product.variants?.[0]?.id ?? null

  const defaultGarment = extractDefaultGarmentFromProduct(product)

  return (
    <CustomizerTemplate
      embedded
      pdpSyncedVariantId={syncVariantId}
      integratedPdpSlots={integratedPdpSlots}
      defaultGarmentImage={defaultGarment?.url ?? null}
      defaultGarmentTitle={defaultGarment?.title ?? null}
      product={product}
    />
  )
}
