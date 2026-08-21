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
import { getCustomer } from "@lib/data/customer"
import { toCustomerContact } from "@modules/customizer/lib/customer-contact"
import { getPrintProfileForProduct } from "@lib/data/print-profiles"
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
import StudioLauncher from "@modules/customizer/components/studio-launcher"
import AssemblyLayoutGrid from "@modules/products/components/assembly-layout-grid"
import LandingColourSelector from "@modules/customizer/components/landing-colour-selector"
import CartButton from "@modules/layout/components/cart-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type CustomizerMode = "studio" | "split-tabs"

// Cutover switch — which customizer the PDP renders for normal apparel:
//   "studio"     = full-screen Assembly design studio (StudioLauncher overlay,
//                  same composition as /customizer-v2)
//   "split-tabs" = legacy Photos | Customise inline tabs (PdpSplitTabs)
//
// The DEFAULT lives in code (not env-only) so flipping it is a real commit —
// Vercel skips no-op rebuilds on env-only changes (the same gotcha that bit the
// PRINT_PROFILES flip). `NEXT_PUBLIC_PDP_STUDIO` / `PDP_STUDIO` ("true"/"false")
// are an ops override on top of the code default either way. The
// `/customiser-old/[handle]` recovery route forces "split-tabs" regardless.
const PDP_STUDIO_DEFAULT = true
const pdpStudioEnv = process.env.NEXT_PUBLIC_PDP_STUDIO ?? process.env.PDP_STUDIO
const PDP_STUDIO_ENABLED =
  pdpStudioEnv === "true"
    ? true
    : pdpStudioEnv === "false"
    ? false
    : PDP_STUDIO_DEFAULT

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  /**
   * Force a specific customizer experience, overriding the PDP_STUDIO flag.
   * The `/customiser-old/[handle]` recovery route passes "split-tabs" so the
   * legacy PDP stays reachable even after the studio cutover.
   */
  customizerMode?: CustomizerMode
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
  return (
    <EmbeddedProductCustomizer
      product={product}
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
  customizerMode,
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

  const mode: CustomizerMode =
    customizerMode ?? (PDP_STUDIO_ENABLED ? "studio" : "split-tabs")

  // Blank garments cannot be ordered directly — `hideInlinePurchaseControls`
  // swaps the size/qty/add-to-cart row inside ProductActions for a "Customize
  // this product" CTA that scrolls to the embedded customizer below.
  const gallerySlot = (
    <ImageGallery
      product={product}
      images={product?.images || []}
      thumbnail={product?.thumbnail || null}
      heroLayout
      // Cap the hero so the thumbnail strip sits above the fold on
      // standard laptop viewports. The aspect ratio still drives the
      // hero's width proportionally.
      heroClassName={mode === "studio" ? "max-h-[62vh]" : "max-h-[55vh]"}
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

  // Brand/audience tags, description, features. Title is rendered above the
  // customizer (split-tabs) or by StudioLauncher (studio), so it's hidden here.
  const productInfoSlot = <ProductInfo product={product} hideTitle />

  // ETA + decoration estimator (left), spec/shipping tabs (right). Collapses to
  // a single column on mobile. Shared by both layouts; in studio mode it lives
  // on the landing (below the hero) so the page is a full, indexable PDP.
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
        <ProductTabs product={product} />
      </div>
    </div>
  )

  // Cross-sell + related. In split-tabs mode they're full-width sections at the
  // very bottom (`contained` adds the page gutter). In studio mode they ride
  // inside the StudioLauncher landing's inert wrapper — which already sits in a
  // `content-container` — so we drop the inner gutter to avoid doubling `px-6`,
  // and they go inert with the rest of the landing while the overlay is open.
  const crossSellAndRelated = (contained: boolean) => (
    <>
      <div
        className={`${contained ? "content-container " : ""}my-12 small:my-20`}
        data-testid="cross-sell-container"
      >
        <Suspense fallback={null}>
          <FrequentlyBoughtTogether product={product} countryCode={countryCode} />
        </Suspense>
      </div>

      <div
        className={`${contained ? "content-container " : ""}my-16 small:my-32`}
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )

  if (mode === "studio") {
    // Full Assembly studio (canvas + collapsible section menu), mounted by
    // StudioLauncher only once the customer opens the overlay.
    const studioSlot = (
      <AssemblyLayoutGrid
        customizerSlot={
          <PdpCustomizerBoundary variant="studio">
            <Suspense fallback={<StudioSlotFallback />}>
              <StudioCustomizerContent
                product={product}
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
        <ViewItemTracker product={product} />
        <CartEditBanner />
        <div className="content-container py-6" data-testid="product-container">
          <PrintPlacementProvider>
            <ProductOptionsProvider product={product}>
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
                  colourSelector={<LandingColourSelector product={product} />}
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
                      {crossSellAndRelated(false)}
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

  // Legacy split-tabs PDP (Photos | Customise this garment).
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
                        <Suspense fallback={<StudioSlotFallback />}>
                          <StudioCustomizerContent
                            product={product}
                            variantPickersSlot={variantPickersSlot}
                          />
                        </Suspense>
                      </PdpCustomizerBoundary>
                    }
                  />
                }
              />

              {/* ProductInfo below the customizer — brand/audience tags,
                  description, features. Title is rendered above the
                  customizer so we hide it here to avoid duplication. */}
              <div className="mt-12">{productInfoSlot}</div>

              {/* Details stack below the product info in a 2-up grid on
                  desktop: ETA + decoration estimator on the left,
                  spec/shipping tabs on the right. */}
              <div className="mt-12">{detailsSection}</div>
            </CustomizeModeProvider>
          </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>

      {crossSellAndRelated(true)}
    </>
  )
}

export default ProductTemplate
