import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import ProductActionsWrapper from "./product-actions-wrapper"
import DtfAutoBuilderTemplate, {
  isDtfAutoBuilderProduct,
} from "@modules/products/templates/dtf-auto-builder-template"
import EmbeddedProductCustomizer from "@modules/customizer/components/embedded-product-customizer"
import { HttpTypes } from "@medusajs/types"
import { PrintPlacementProvider } from "@modules/products/context/print-placement-context"
import { ProductOptionsProvider } from "@modules/products/context/product-options-context"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  if (isDtfAutoBuilderProduct(product)) {
    return (
      <DtfAutoBuilderTemplate
        product={product}
        region={region}
        countryCode={countryCode}
      />
    )
  }

  return (
    <>
      <div className="content-container py-6 relative" data-testid="product-container">
        <PrintPlacementProvider>
          <ProductOptionsProvider product={product}>
            <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-12 lg:items-start lg:gap-x-8 lg:gap-y-8">
              <aside className="flex flex-col gap-y-6 py-8 small:sticky small:top-48 lg:col-span-3 lg:max-w-none lg:py-0">
                <ProductInfo product={product} />
                <ProductTabs product={product} />
              </aside>

              <EmbeddedProductCustomizer
                product={product}
                integratedPdpSlots={{
                  gallery: (
                    <ImageGallery
                      product={product}
                      images={product?.images || []}
                      thumbnail={product?.thumbnail || null}
                    />
                  ),
                  variantPickers: (
                    <>
                      <ProductOnboardingCta />
                      <Suspense
                        fallback={
                          <ProductActions
                            disabled={true}
                            product={product}
                            region={region}
                          />
                        }
                      >
                        <ProductActionsWrapper id={product.id} region={region} />
                      </Suspense>
                    </>
                  ),
                }}
              />
            </div>
          </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>

      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
