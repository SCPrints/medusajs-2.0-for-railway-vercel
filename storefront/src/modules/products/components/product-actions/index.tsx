"use client"

import { Button } from "@medusajs/ui"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

import Divider from "@modules/common/components/divider"
import ProductOptionFields from "@modules/products/components/product-actions/product-option-fields"
import { usePrintPlacement } from "@modules/products/context/print-placement-context"
import { useProductOptions } from "@modules/products/context/product-options-context"
import { resolveVariantFromOptions } from "@modules/products/lib/variant-options"

import ProductPrice from "../product-price"
import { addToCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

export default function ProductActions({
  product,
  region,
  disabled,
}: ProductActionsProps) {
  const [isAdding, setIsAdding] = useState(false)
  const countryCode = useParams().countryCode as string
  const { overlayUrl, overlayFileName, placement } = usePrintPlacement()
  const { options, setOptionValue } = useProductOptions()

  const selectedVariant = useMemo(
    () => resolveVariantFromOptions(product, options),
    [product, options]
  )

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

    const printPlacementMetadata = overlayUrl
      ? {
          printPlacement: {
            version: 1,
            placement,
            sourceFileName: overlayFileName,
          },
        }
      : undefined

    await addToCart({
      variantId: selectedVariant.id,
      quantity: 1,
      countryCode,
      metadata: printPlacementMetadata,
    })

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
      </div>
    </>
  )
}
