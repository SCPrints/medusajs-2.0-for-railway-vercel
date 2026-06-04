"use client"

import { HttpTypes } from "@medusajs/types"

import ProductOptionFields from "@modules/products/components/product-actions/product-option-fields"
import { useProductOptions } from "@modules/products/context/product-options-context"

type Props = {
  product: HttpTypes.StoreProduct
}

/**
 * Colour selector for the `/customizer-v2` photos (landing) page.
 *
 * Reuses the standard `ProductOptionFields` colour swatches (size hidden) and
 * drives the shared `ProductOptionsProvider` via `setOptionValue`. The landing
 * gallery (`ImageGallery`) is already colour-aware — it filters its photos by
 * the selected colour from the same context — so picking a swatch here swaps
 * the displayed garment photos, and the chosen colour also carries into the
 * studio when the customer opens it.
 */
export default function LandingColourSelector({ product }: Props) {
  const { options, setOptionValue } = useProductOptions()

  return (
    <ProductOptionFields
      product={product}
      options={options}
      updateOption={setOptionValue}
      disabled={false}
      hideSizeOption
      hideTrigger
    />
  )
}
