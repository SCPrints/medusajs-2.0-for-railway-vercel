"use client"

import { useMemo, type ReactNode } from "react"
import { HttpTypes } from "@medusajs/types"

import { extractDefaultGarmentFromProduct } from "@modules/customizer/lib/default-garment"
import { useProductOptionsOptional } from "@modules/products/context/product-options-context"
import { isColorOptionTitle, resolveVariantFromOptions } from "@modules/products/lib/variant-options"
import CustomizerTemplate from "@modules/customizer/templates"
import type { Tier } from "@lib/customer-tiers"

type Props = {
  product: HttpTypes.StoreProduct
  /** When set, gallery and variant pickers sit in the same grid as the design canvas (unified PDP layout). */
  integratedPdpSlots?: {
    gallery: ReactNode
    variantPickers: ReactNode
  }
  /** Logged-in customer's tier, resolved by the server parent. */
  tier?: Tier | null
  /**
   * Optional product list for the in-canvas "Change garment" picker. Used by the
   * standalone /customizer page so customers can swap garments without going
   * back to the catalog; PDP usage typically omits this since the URL already
   * scopes the customizer to a specific product.
   */
  pickerProducts?: Array<{
    id: string
    handle: string
    title: string
    thumbnail: string | null
  }>
}

/**
 * Logo customizer on the PDP: variant selection can live in `integratedPdpSlots.variantPickers`
 * so it aligns with ProductActions; canvas shows the garment mockup for the synced variant.
 */
export default function EmbeddedProductCustomizer({
  product,
  integratedPdpSlots,
  tier = null,
  pickerProducts,
}: Props) {
  const productOptions = useProductOptionsOptional()

  const syncVariantId = useMemo(() => {
    const opts = productOptions?.options ?? {}
    const resolved = resolveVariantFromOptions(product, opts)
    const ids = new Set(product.variants?.map((v) => v.id) ?? [])
    if (resolved?.id && ids.has(resolved.id)) {
      return resolved.id
    }
    // No exact full-option match. Prefer the first variant of the SELECTED
    // COLOUR rather than the global first variant — otherwise the canvas mockup
    // snaps to a different colour than the picker shows when the chosen colour
    // has no variant for the currently-selected size.
    const colorOption = product.options?.find((o) => isColorOptionTitle(o.title))
    const selectedColor = colorOption?.title ? opts[colorOption.title] : undefined
    if (colorOption && selectedColor) {
      const colorVariant = product.variants?.find((v) =>
        v.options?.some(
          (vo) => vo.option_id === colorOption.id && vo.value === selectedColor
        )
      )
      if (colorVariant?.id) return colorVariant.id
    }
    return product.variants?.[0]?.id ?? null
  }, [product, productOptions?.options])

  const defaultGarment = extractDefaultGarmentFromProduct(product)

  return (
    <CustomizerTemplate
      embedded
      pdpSyncedVariantId={syncVariantId}
      integratedPdpSlots={integratedPdpSlots}
      defaultGarmentImage={defaultGarment?.url ?? null}
      defaultGarmentTitle={defaultGarment?.title ?? null}
      product={product}
      pickerProducts={pickerProducts}
      tier={tier}
    />
  )
}
