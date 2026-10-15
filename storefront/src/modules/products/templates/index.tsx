import React, { Suspense } from "react"

import FrequentlyBoughtTogether from "@modules/products/components/frequently-bought-together"
import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductionEtaStrip from "@modules/products/components/production-eta-strip"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import LookbookStrip from "@modules/lookbook/components/lookbook-strip"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import SkeletonProductionEtaStrip from "@modules/skeletons/components/skeleton-production-eta-strip"
import ProductActionsWrapper from "./product-actions-wrapper"
import StudioFromContext from "@modules/customizer/components/studio-from-context"
import { getCustomerTier } from "@lib/data/customer-tier"
import { getCustomer } from "@lib/data/customer"
import { toCustomerContact } from "@modules/customizer/lib/customer-contact"
import { getPrintProfileForProduct } from "@lib/data/print-profiles"
import { toClientProduct } from "@lib/util/client-product"
import CartEditBanner from "@modules/customizer/components/cart-edit-banner"
import PdpCustomizerBoundary from "@modules/products/components/pdp-customizer-boundary"
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
import { ViewItemTracker } from "@modules/products/components/view-item-tracker"
import StudioLauncher from "@modules/customizer/components/studio-launcher"
import AssemblyLayoutGrid from "@modules/products/components/assembly-layout-grid"
import LandingColourSelector from "@modules/customizer/components/landing-colour-selector"
import CartButton from "@modules/layout/components/cart-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Apparel PDPs render the full-screen Assembly design studio (StudioLauncher
// overlay, same composition as /customizer-v2). The legacy split-tabs PDP and
// its PDP_STUDIO flag + /customiser-old recovery route were retired 2026-10-15.
type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

/**
 * The customizer needs the customer tier (a cookies() read → forces dynamic
 * rendering) and the resolved print profile. Awaiting them at the top of
 * ProductTemplate used to block the ENTIRE product body — gallery, title,
 * CTA — behind both lookups, which kept the PDP landing out of the PPR
 * static shell and made the hero image stream seconds late (the measured
 * CLS-0.39 skeleton swap). Resolving them inside this Suspense-wrapped slot
 * lets the landing prerender; only the studio slot streams behind the data.
 */
async function StudioCustomizerContent({
  product,
  assemblyLayout,
  variantPickersSlot,
}: {
  product: HttpTypes.StoreProduct
  assemblyLayout?: boolean
  variantPickersSlot: React.ReactNode
}) {
  const [tier, printProfile, customer] = await Promise.all([
    getCustomerTier(),
    getPrintProfileForProduct(product),
    getCustomer(),
  ])
  // `product` is only used server-side here (print profile). The studio reads
  // it from ProductOptionsContext so this dynamic slot doesn't re-serialise it.
  return (
    <StudioFromContext
      assemblyLayout={assemblyLayout}
      integratedPdpSlots={{
        gallery: null,
        variantPickers: variantPickersSlot,
      }}
      tier={tier}
      customerContact={toCustomerContact(customer)}
      printProfile={printProfile}
    />
  )
}

/** Shown if the studio overlay is opened before the slot finishes streaming
 *  (deep-link auto-open on a cold cache) — normal clicks never see it. */
function StudioSlotFallback() {
  return (
    <div className="flex min-h-[min(58vh,680px)] w-full items-center justify-center text-sm text-ui-fg-muted">
      Loading the design studio…
    </div>
  )
}

const ProductTemplate: React.FC<ProductTemplateProps> = async ({
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

  if (isBottleProduct(product)) {
    return (
      <BottlePdpTemplate
        product={product}
        region={region}
        countryCode={countryCode}
      />
    )
  }

  // One slimmed copy for every CLIENT boundary below (gallery, pickers, option
  // context, colour selector, tracker, studio). Server components (ProductInfo,
  // ProductTabs, cross-sell, related) keep the full `product`. One shared
  // reference also lets React Flight dedupe it within a render instead of
  // serialising the variants array once per client prop.
  const clientProduct = toClientProduct(product)

  // Blank garments cannot be ordered directly — `hideInlinePurchaseControls`
  // swaps the size/qty/add-to-cart row inside ProductActions for a "Customize
  // this product" CTA that scrolls to the embedded customizer below.
  const gallerySlot = (
    <ImageGallery
      product={clientProduct}
      images={clientProduct.images || []}
      thumbnail={clientProduct.thumbnail || null}
      heroLayout
      // Cap the hero so the thumbnail strip sits above the fold on
      // standard laptop viewports. The aspect ratio still drives the
      // hero's width proportionally.
      heroClassName="max-h-[62vh]"
    />
  )
  const variantPickersSlot = (
    <Suspense
      fallback={
        <ProductActions
          disabled={true}
          region={region}
          hideInlinePurchaseControls
        />
      }
    >
      <ProductActionsWrapper
        region={region}
        hideInlinePurchaseControls
      />
    </Suspense>
  )

  const decorationMethods = getEnabledDecorationMethods(product)

  // Brand/audience tags, description, features. StudioLauncher renders the
  // title, so it's hidden here.
  const productInfoSlot = <ProductInfo product={product} hideTitle />

  // ETA + decoration estimator (left), spec/shipping tabs (right). Collapses to
  // a single column on mobile. Lives on the landing (below the hero) so the
  // page is a full, indexable PDP.
  const detailsSection = (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="flex flex-col gap-y-6">
        <Suspense fallback={<SkeletonProductionEtaStrip />}>
          <ProductionEtaStrip />
        </Suspense>
        {decorationMethods.length > 0 ? (
          <DecorationEstimator methods={decorationMethods} />
        ) : null}
      </div>
      <div>
        {/* Client component; reads root fields only (material, weight, dims). */}
        <ProductTabs product={clientProduct} />
      </div>
    </div>
  )

  // Cross-sell + related ride inside the StudioLauncher landing's inert
  // wrapper — which already sits in a `content-container`, so no inner gutter —
  // and go inert with the rest of the landing while the overlay is open.
  const crossSellAndRelated = (
    <>
      <div className="my-12 small:my-20" data-testid="cross-sell-container">
        <Suspense fallback={null}>
          <FrequentlyBoughtTogether product={product} countryCode={countryCode} />
        </Suspense>
      </div>

      {/* Past jobs printed on this garment; renders nothing (and the
          wrapper collapses) when no lookbook photo links this product. */}
      <div className="my-12 empty:hidden small:my-20">
        <Suspense fallback={null}>
          <LookbookStrip
            productHandle={product.handle}
            title="Real jobs on this garment"
          />
        </Suspense>
      </div>

      <div className="my-16 small:my-32" data-testid="related-products-container">
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )

  // Full Assembly studio (canvas + collapsible section menu), mounted by
  // StudioLauncher only once the customer opens the overlay.
  const studioSlot = (
    <AssemblyLayoutGrid
      customizerSlot={
        <PdpCustomizerBoundary variant="studio">
          <Suspense fallback={<StudioSlotFallback />}>
            <StudioCustomizerContent
              product={clientProduct}
              assemblyLayout
              variantPickersSlot={variantPickersSlot}
            />
          </Suspense>
        </PdpCustomizerBoundary>
      }
    />
  )

  return (
    <>
      <ViewItemTracker product={clientProduct} />
      <CartEditBanner />
      <div className="content-container py-6" data-testid="product-container">
        <PrintPlacementProvider>
          <ProductOptionsProvider product={clientProduct}>
            <CustomizeModeProvider>
              {/* Photo-first landing; the design studio opens as a
                  full-screen overlay. StudioLauncher renders the product
                  title (h1), CTA, colour swatches, and surfaces the
                  description via its Details drawer. */}
              <StudioLauncher
                title={product.title ?? "Customise"}
                // Deep links (cart edit, reorder, saved design) auto-open the
                // studio so the canvas mounts and rehydrates — handled inside
                // StudioLauncher via the URL params, so nothing extra here.
                gallery={gallerySlot}
                colourSelector={<LandingColourSelector product={clientProduct} />}
                cartButton={
                  <Suspense
                    fallback={
                      <LocalizedClientLink
                        href="/cart"
                        className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-ui-fg-base hover:bg-ui-bg-subtle"
                      >
                        Cart
                      </LocalizedClientLink>
                    }
                  >
                    <CartButton />
                  </Suspense>
                }
                productInfo={productInfoSlot}
                studio={studioSlot}
                // Everything below the hero — ETA/estimator/spec tabs plus
                // cross-sell/related — rides inside the landing's inert
                // wrapper so it leaves the a11y/tab order while the overlay
                // is open, and is server-rendered for crawlers.
                belowFold={
                  <>
                    {detailsSection}
                    {crossSellAndRelated}
                  </>
                }
              />
            </CustomizeModeProvider>
          </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>
    </>
  )
}

export default ProductTemplate
