import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import ProductActionsWrapper from "./product-actions-wrapper"
import EmbeddedProductCustomizer from "@modules/customizer/components/embedded-product-customizer"
import PdpCustomizerBoundary from "@modules/products/components/pdp-customizer-boundary"
import DtfAutoBuilderTemplate, {
  isDtfAutoBuilderProduct,
} from "@modules/products/templates/dtf-auto-builder-template"
import { HttpTypes } from "@medusajs/types"
import { PrintPlacementProvider } from "@modules/products/context/print-placement-context"
import { ProductOptionsProvider } from "@modules/products/context/product-options-context"
import { PdpCustomizerGallerySyncProvider } from "@modules/products/context/pdp-customizer-gallery-sync-context"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const isPdpEmbedCustomizerEnabled = () =>
  String(process.env.NEXT_PUBLIC_PDP_EMBED_CUSTOMIZER ?? "true")
    .trim()
    .toLowerCase() === "true"

const shouldRenderEmbeddedCustomizer = (product: HttpTypes.StoreProduct) => {
  if (!isPdpEmbedCustomizerEnabled()) {
    return false
  }

  return true
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return null
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
            <PdpCustomizerGallerySyncProvider>
            <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-12 lg:items-start lg:gap-x-8 lg:gap-y-8">
              <aside className="flex flex-col gap-y-6 py-8 small:sticky small:top-48 lg:col-span-3 lg:max-w-none lg:py-0">
                <ProductInfo product={product} />
                <ProductTabs product={product} />
              </aside>

              <div className="block w-full relative lg:col-span-6">
                <ImageGallery
                  product={product}
                  images={product?.images || []}
                  thumbnail={product?.thumbnail || null}
                />
              </div>

              <div className="flex flex-col gap-y-6 py-8 small:sticky small:top-48 lg:col-span-3 lg:max-w-none lg:py-0">
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
              </div>
            </div>
            {shouldRenderEmbeddedCustomizer(product) ? (
              <PdpCustomizerBoundary>
                <EmbeddedProductCustomizer product={product} />
              </PdpCustomizerBoundary>
            ) : null}
            </PdpCustomizerGallerySyncProvider>
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
