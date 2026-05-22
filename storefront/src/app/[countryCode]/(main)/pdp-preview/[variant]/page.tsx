import { notFound } from "next/navigation"
import { Suspense } from "react"
import type { Metadata } from "next"
import { HttpTypes } from "@medusajs/types"

import { getCustomerTier } from "@lib/data/customer-tier"
import { getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import EmbeddedProductCustomizer from "@modules/customizer/components/embedded-product-customizer"
import ImageGallery from "@modules/products/components/image-gallery"
import PdpCustomizerBoundary from "@modules/products/components/pdp-customizer-boundary"
import PdpLayoutGrid from "@modules/products/components/pdp-layout-grid"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import { CustomizeModeProvider } from "@modules/products/context/customize-mode-context"
import { PrintPlacementProvider } from "@modules/products/context/print-placement-context"
import { ProductOptionsProvider } from "@modules/products/context/product-options-context"
import ProductActionsWrapper from "@modules/products/templates/product-actions-wrapper"
import ProductInfo from "@modules/products/templates/product-info"

import GalleryFirstTabs from "../_components/gallery-first-tabs"
import GalleryTabs from "../_components/gallery-tabs"
import PreviewSwitcher from "../_components/preview-switcher"

/**
 * Throwaway preview routes for reviewing how the gallery should sit on
 * the PDP. Mounted under /<countryCode>/pdp-preview/<variant>; the
 * switcher pill at the top of each page links between the variants.
 * Not linked from production navigation.
 */

const VALID_VARIANTS = new Set([
  "current",
  "no-gallery",
  "below",
  "tabs",
  "split",
])
const DEFAULT_HANDLE = "as-colour-5001-5001"

type RouteParams = { countryCode: string; variant: string }
type RouteSearch = { handle?: string | string[] }

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "PDP layout preview | SC PRINTS",
    robots: { index: false, follow: false },
  }
}

function firstString(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

export default async function PdpPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<RouteSearch>
}) {
  const { countryCode, variant } = await params
  const sp = await searchParams

  if (!VALID_VARIANTS.has(variant)) {
    notFound()
  }

  const handle = firstString(sp.handle) ?? DEFAULT_HANDLE

  const region = await getRegion(countryCode)
  let product: HttpTypes.StoreProduct | undefined
  if (region) {
    const {
      response: { products },
    } = await getProductsList({
      countryCode,
      queryParams: {
        handle,
        limit: 1,
      } as HttpTypes.StoreProductParams,
    })
    product = products[0]
  }

  // Local dev with an empty backend won't resolve the product. Render a
  // friendly placeholder so the switcher + page structure are still
  // viewable; on Vercel preview the product fetch succeeds and the real
  // customizer renders.
  if (!region || !product) {
    return (
      <div className="content-container py-6 relative">
        <PreviewSwitcher countryCode={countryCode} />
        <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle/50 p-8 text-center">
          <p className="text-sm font-semibold text-ui-fg-base">
            Couldn't load a product
          </p>
          <p className="mt-2 text-xs text-ui-fg-subtle">
            Tried <code className="rounded bg-ui-bg-base px-1.5 py-0.5">{handle}</code>
            {" "}— pass <code className="rounded bg-ui-bg-base px-1.5 py-0.5">?handle=&lt;your-product&gt;</code>{" "}
            to point at a different one. On the Vercel preview deploy the default
            handle resolves and the real customizer renders below.
          </p>
        </div>
      </div>
    )
  }

  const tier = await getCustomerTier()

  // The gallery is built once on the server and reused per-variant —
  // each variant chooses where to render it (or whether to render it
  // at all).
  const gallerySlot = (
    <ImageGallery
      product={product}
      images={product?.images || []}
      thumbnail={product?.thumbnail || null}
      heroLayout
    />
  )

  const variantPickersSlot = (
    <Suspense
      fallback={
        <ProductActions
          disabled
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

  // Per-variant placement flags.
  const galleryInWizard = variant === "current"
  const galleryBelowCustomizer = variant === "below"
  const galleryInTabs = variant === "tabs"
  const splitTabs = variant === "split"

  // The customizer block is reused by both the normal variants and the
  // "split" variant (where it becomes the content of the Customiser tab).
  const customizerBlock = (
    <PdpLayoutGrid
      customizerSlot={
        <PdpCustomizerBoundary>
          <EmbeddedProductCustomizer
            product={product}
            integratedPdpSlots={{
              gallery: galleryInWizard ? gallerySlot : null,
              variantPickers: variantPickersSlot,
            }}
            tier={tier}
          />
        </PdpCustomizerBoundary>
      }
    />
  )

  return (
    <div className="content-container py-6 relative">
      <PreviewSwitcher countryCode={countryCode} />

      <PrintPlacementProvider>
        <ProductOptionsProvider product={product}>
          <CustomizeModeProvider>
            {/* Always: garment name above the customizer. */}
            <h1
              className="mb-4 text-3xl font-semibold leading-tight text-ui-fg-base lg:text-4xl"
              data-testid="product-title"
            >
              {product.title}
            </h1>

            {/* Variant "split": gallery and customizer as 2 top-level
                tabs (Photos default, Customiser swaps in on click).
                Other variants render the customizer directly with the
                gallery slot wired according to their flag. */}
            {splitTabs ? (
              <GalleryFirstTabs
                gallery={gallerySlot}
                variantPickers={variantPickersSlot}
                designContent={customizerBlock}
              />
            ) : (
              customizerBlock
            )}

            {/* Variant "below": gallery as its own full-width section
                directly under the customizer, with a clear heading. */}
            {galleryBelowCustomizer ? (
              <section className="mt-12">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ui-fg-subtle">
                  Product photos
                </h2>
                <div className="mx-auto max-w-2xl">{gallerySlot}</div>
              </section>
            ) : null}

            {/* Always: full ProductInfo (description / features) below
                the customizer; title is already shown above so hide it
                here. */}
            <div className="mt-12">
              <ProductInfo product={product} hideTitle />
            </div>

            {/* Variant "tabs": Photos becomes the first tab of a 3-tab
                strip. Other variants get the production ProductTabs
                (Specifications + Shipping & Returns). */}
            <div className="mt-12">
              {galleryInTabs ? (
                <GalleryTabs product={product} gallery={gallerySlot} />
              ) : (
                <ProductTabs product={product} />
              )}
            </div>
          </CustomizeModeProvider>
        </ProductOptionsProvider>
      </PrintPlacementProvider>
    </div>
  )
}
