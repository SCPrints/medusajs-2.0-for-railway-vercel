import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import DtfBuilderLink from "@modules/products/components/dtf-builder-link"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Divider from "@modules/common/components/divider"
import ProductActionsWrapper from "./product-actions-wrapper"
import { HttpTypes } from "@medusajs/types"
import { PrintPlacementProvider } from "@modules/products/context/print-placement-context"
import { ProductOptionsProvider } from "@modules/products/context/product-options-context"
import { Heading, Text } from "@medusajs/ui"
import Accordion from "@modules/products/components/product-tabs/accordion"
import { DTF_AUTO_BUILDER_HANDLE } from "@modules/dtf-builder/constants"

export { DTF_AUTO_BUILDER_HANDLE }

export function isDtfAutoBuilderProduct(product: HttpTypes.StoreProduct): boolean {
  return product.handle === DTF_AUTO_BUILDER_HANDLE
}

type Props = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const DtfAutoBuilderTemplate: React.FC<Props> = ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return null
  }

  const isAu = region.currency_code?.toLowerCase() === "aud"

  return (
    <>
      <div className="content-container py-6">
        <Text className="text-small-regular text-ui-fg-muted border border-ui-border-base rounded-md px-4 py-3 bg-ui-bg-subtle mb-6">
          Heads up: always follow the latest press and wash instructions shipped with your order so transfers cure
          correctly.
        </Text>
      </div>

      <div
        className="content-container flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        <PrintPlacementProvider>
          <ProductOptionsProvider product={product}>
            <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-6">
              <ProductInfo product={product} />
              <div className="w-full">
                <Accordion type="multiple">
                  <Accordion.Item
                    title="Product details"
                    headingSize="medium"
                    value="details"
                  >
                    <div className="text-small-regular py-6 text-ui-fg-subtle space-y-3">
                      <p>
                        Each variant is a fixed roll width (58 cm) with your chosen length. Pricing scales by length so
                        you only pay for the material you need.
                      </p>
                      <p>
                        After checkout, use <strong>Create design</strong> to upload PNGs and notes—we match the gang
                        sheet to the size you purchased.
                      </p>
                    </div>
                  </Accordion.Item>
                  <Accordion.Item
                    title="Shipping & turnaround"
                    headingSize="medium"
                    value="shipping"
                  >
                    <div className="text-small-regular py-6 text-ui-fg-subtle space-y-3">
                      <p>
                        <strong>Standard turnaround:</strong> orders confirmed by early afternoon on business days
                        typically ship the next business day.
                      </p>
                      <p>
                        <strong>Express:</strong> where offered, priority handling bumps dispatch up—cut-off times apply.
                      </p>
                      {isAu ? (
                        <p>
                          <strong>Australia:</strong> flat rates mirror common carrier tiers (regular and express). Final
                          totals appear at checkout with tax.
                        </p>
                      ) : (
                        <p>
                          International delivery uses the same flat shipping profile as the rest of the catalog—see
                          checkout for live quotes.
                        </p>
                      )}
                    </div>
                  </Accordion.Item>
                  <Accordion.Item title="Returns & refunds" headingSize="medium" value="returns">
                    <div className="text-small-regular py-6 text-ui-fg-subtle space-y-3">
                      <p>
                        Because gang sheets are produced to your artwork, we cannot accept change-of-mind returns. If
                        something arrives damaged or off-spec, contact support with photos and we will make it right.
                      </p>
                    </div>
                  </Accordion.Item>
                </Accordion>
              </div>
            </div>
            <div className="block w-full relative">
              <ImageGallery
                product={product}
                images={product?.images || []}
                thumbnail={product?.thumbnail || null}
              />
            </div>
            <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-6">
              <div className="flex flex-col gap-y-3">
                <DtfBuilderLink
                  product={product}
                  className="flex w-full h-10 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-base text-small font-medium text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
                />
                <Text className="text-xsmall text-ui-fg-muted text-center">
                  Opens the gang sheet builder for the size you select—upload PNGs and lay out your roll.
                </Text>
              </div>
              <Suspense
                fallback={
                  <ProductActions disabled={true} product={product} region={region} />
                }
              >
                <ProductActionsWrapper id={product.id} region={region} />
              </Suspense>
            </div>
          </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>

      <div className="content-container my-12 small:my-20 space-y-12">
        <Divider />
        <section className="grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16">
          <div>
            <Heading level="h2" className="text-xl mb-4 text-ui-fg-base">
              Prefer a manual order?
            </Heading>
            <Text className="text-medium text-ui-fg-subtle space-y-3">
              <span className="block">
                Send your files and instructions via our contact form—we will confirm sizing, send an invoice, and
                queue production once payment clears. Manual orders take a little longer because of the extra proofing
                steps.
              </span>
            </Text>
            <LocalizedClientLink
              href="/contact"
              className="inline-flex mt-4 text-small font-medium text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              Contact us for a manual gang sheet →
            </LocalizedClientLink>
          </div>
          <div>
            <Heading level="h2" className="text-xl mb-4 text-ui-fg-base">
              Design ownership & copyright
            </Heading>
            <Text className="text-medium text-ui-fg-subtle space-y-3">
              <span className="block">
                Your artwork stays yours—we only use it to produce your transfers. You are responsible for having the
                rights to print every asset you supply.
              </span>
            </Text>
          </div>
        </section>
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

export default DtfAutoBuilderTemplate
