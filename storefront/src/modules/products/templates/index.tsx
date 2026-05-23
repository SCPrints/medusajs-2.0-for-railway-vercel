import React, { Suspense } from "react"

import FrequentlyBoughtTogether from "@modules/products/components/frequently-bought-together"
import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductionEtaStrip from "@modules/products/components/production-eta-strip"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import SkeletonProductionEtaStrip from "@modules/skeletons/components/skeleton-production-eta-strip"
import ProductActionsWrapper from "./product-actions-wrapper"
import EmbeddedProductCustomizer from "@modules/customizer/components/embedded-product-customizer"
import { getCustomerTier } from "@lib/data/customer-tier"
import CartEditBanner from "@modules/customizer/components/cart-edit-banner"
import PdpCustomizerBoundary from "@modules/products/components/pdp-customizer-boundary"
import PdpSplitTabs from "@modules/products/components/pdp-split-tabs"
import DtfAutoBuilderTemplate, {
  isDtfAutoBuilderProduct,
} from "@modules/products/templates/dtf-auto-builder-template"
import BottlePdpTemplate from "@modules/bottles/components/bottle-pdp-template"
import { isBottleProduct } from "@modules/bottles/lib/is-bottle-product"
import { DecorationEstimator } from "@modules/decoration/components"
import { getEnabledDecorationMethods } from "@modules/decoration/lib/product"
import { HttpTypes } from "@medusajs/types"
import { PrintPlacementProvider } from "@modules/products/context/print-placement-context"
import { ProductOptionsProvider } from "@modules/products/context/product-options-context"
import { CustomizeModeProvider } from "@modules/products/context/customize-mode-context"
import PdpLayoutGrid from "@modules/products/components/pdp-layout-grid"
import { ViewItemTracker } from "@modules/products/components/view-item-tracker"
type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const ProductTemplate: React.FC<ProductTemplateProps> = async ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return null
  }

  const tier = await getCustomerTier()

  if (isDtfAutoBuilderProduct(product)) {
    return (
      <DtfAutoBuilderTemplate
        product={product}
        region={region}
        countryCode={countryCode}
      />
    )
  }

  if (isBottleProduct(product)) {
    return (
      <BottlePdpTemplate
        product={product}
        region={region}
        countryCode={countryCode}
      />
    )
  }

  // All products (including beanies) route through the unified customizer.
  // The customizer surfaces a per-side decoration method picker
  // (print | embroidery) — see customizer/components/decoration-method-picker
  // and embroidery-side-config. Beanies are still restricted by the
  // `allowedPrintSides` logic in customizer/templates/index.tsx (treated as
  // hats, front-only) so the experience is appropriate for the garment.

  // The customizer flow is the only purchase path — blank garments cannot be
  // ordered directly. ProductActions renders a "Customize this product" CTA
  // (via `hideInlinePurchaseControls`) that scrolls to the embedded
  // customizer.
  const gallerySlot = (
    <ImageGallery
      product={product}
      images={product?.images || []}
      thumbnail={product?.thumbnail || null}
      heroLayout
      // Cap the hero so the thumbnail strip sits above the fold on
      // standard laptop viewports. The aspect ratio still drives the
      // hero's width proportionally.
      heroClassName="max-h-[55vh]"
    />
  )
  const variantPickersSlot = (
    <Suspense
      fallback={
        <ProductActions
          disabled={true}
          product={product}
          region={region}
          hideInlinePurchaseControls
        />
      }
    >
      <ProductActionsWrapper
        id={product.id}
        region={region}
        hideInlinePurchaseControls
      />
    </Suspense>
  )

  const decorationMethods = getEnabledDecorationMethods(product)

  return (
    <>
      <ViewItemTracker product={product} />
      <CartEditBanner />
      <div className="content-container py-6 relative" data-testid="product-container">
        <PrintPlacementProvider>
          <ProductOptionsProvider product={product}>
            <CustomizeModeProvider>
              {/* Just the garment name above the customizer so the
                  customer always has a clear page title without the
                  full tag/description block pushing the design surface
                  down. Tags + description live in the ProductInfo
                  block below. */}
              <h1
                className="mb-4 text-3xl font-semibold leading-tight text-ui-fg-base lg:text-4xl"
                data-testid="product-title"
              >
                {product.title}
              </h1>

              {/* Two top-level tabs: Photos (gallery + colour picker)
                  and Customise this garment (full canvas + wizard).
                  Photos is the default so customers see the product
                  immediately; the rose CTA on the right flips to the
                  design surface in the same slot. The colour pick
                  survives the swap because both panels share the
                  ProductOptionsContext. The customizer's own gallery
                  slot is nulled out — the gallery lives on the Photos
                  tab instead, so we don't show it twice. */}
              <PdpSplitTabs
                gallery={gallerySlot}
                variantPickers={variantPickersSlot}
                designContent={
                  // PdpLayoutGrid provides the 12-col grid parent that
                  // EmbeddedProductCustomizer's inner col-span-7/5
                  // children span against.
                  <PdpLayoutGrid
                    customizerSlot={
                      <PdpCustomizerBoundary>
                        <EmbeddedProductCustomizer
                          product={product}
                          integratedPdpSlots={{
                            gallery: null,
                            variantPickers: variantPickersSlot,
                          }}
                          tier={tier}
                        />
                      </PdpCustomizerBoundary>
                    }
                  />
                }
              />

              {/* ProductInfo below the customizer — brand/audience tags,
                  description, features. Title is rendered above the
                  customizer so we hide it here to avoid duplication. */}
              <div className="mt-12">
                <ProductInfo product={product} hideTitle />
              </div>

              {/* Details stack below the product info in a 2-up grid on
                  desktop: ETA + decoration estimator on the left,
                  spec/shipping tabs on the right. Collapses to a single
                  column on mobile. */}
              <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
                <div className="flex flex-col gap-y-6">
                  <Suspense fallback={<SkeletonProductionEtaStrip />}>
                    <ProductionEtaStrip />
                  </Suspense>
                  {decorationMethods.length > 0 ? (
                    <DecorationEstimator methods={decorationMethods} />
                  ) : null}
                </div>
                <div>
                  <ProductTabs product={product} />
                </div>
              </div>
            </CustomizeModeProvider>
          </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>

      <div
        className="content-container my-12 small:my-20"
        data-testid="cross-sell-container"
      >
        <Suspense fallback={null}>
          <FrequentlyBoughtTogether
            product={product}
            countryCode={countryCode}
          />
        </Suspense>
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
