import { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { HttpTypes } from "@medusajs/types"
import { getCustomerTier } from "@lib/data/customer-tier"
import { getCustomer } from "@lib/data/customer"
import { getMyDesign } from "@lib/data/designs"
import { retrieveOrder } from "@lib/data/orders"
import { getProductsList } from "@lib/data/products"
import { getPrintProfileForProduct } from "@lib/data/print-profiles"
import { getRegion } from "@lib/data/regions"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import CartEditBanner from "@modules/customizer/components/cart-edit-banner"
import EmbeddedProductCustomizer from "@modules/customizer/components/embedded-product-customizer"
import LandingColourSelector from "@modules/customizer/components/landing-colour-selector"
import StudioLauncher from "@modules/customizer/components/studio-launcher"
import AssemblyLayoutGrid from "@modules/products/components/assembly-layout-grid"
import ImageGallery from "@modules/products/components/image-gallery"
import PdpCustomizerBoundary from "@modules/products/components/pdp-customizer-boundary"
import ProductActions from "@modules/products/components/product-actions"
import { CustomizeModeProvider } from "@modules/products/context/customize-mode-context"
import { PrintPlacementProvider } from "@modules/products/context/print-placement-context"
import { ProductOptionsProvider } from "@modules/products/context/product-options-context"
import ProductActionsWrapper from "@modules/products/templates/product-actions-wrapper"
import ProductInfo from "@modules/products/templates/product-info"

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

type CustomizerPageProps = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{
    handle?: string | string[]
    /** "<orderId>:<lineItemId>" — re-order from order history. */
    reorder?: string | string[]
    /** Saved-design id for the "Edit / re-order" link from /account/designs. */
    design?: string | string[]
  }>
}

const SHIRT_KEYWORDS = ["t-shirt", "t shirt", "tee", "shirt", "singlet", "polo"]

/** Picks a sensible default garment product when no env handle or query is set. */
const findDefaultProduct = (
  products: HttpTypes.StoreProduct[]
): HttpTypes.StoreProduct | null => {
  const shirtProduct = products.find((product) => {
    const title = (product.title ?? "").toLowerCase()
    const handle = (product.handle ?? "").toLowerCase()
    return SHIRT_KEYWORDS.some((keyword) => title.includes(keyword) || handle.includes(keyword))
  })

  if (shirtProduct) {
    return shirtProduct
  }

  return products[0] ?? null
}

const getConfiguredCustomizerHandle = () => {
  const envHandle =
    process.env.CUSTOMIZER_DEFAULT_PRODUCT_HANDLE ??
    process.env.NEXT_PUBLIC_CUSTOMIZER_DEFAULT_PRODUCT_HANDLE

  return typeof envHandle === "string" && envHandle.trim() ? envHandle.trim() : null
}

const firstString = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

/** See the equivalent helper in `/customizer/page.tsx`. */
async function resolveReorderHandle(reorderRef: string): Promise<string | null> {
  const [orderId, lineItemId] = reorderRef.split(":")
  if (!orderId || !lineItemId) return null
  try {
    const order = await retrieveOrder(orderId)
    const items = (order as { items?: Array<{ id: string; product_handle?: string | null }> })
      ?.items
    const line = items?.find((i) => i.id === lineItemId)
    return line?.product_handle ?? null
  } catch {
    return null
  }
}

/** See the equivalent helper in `/customizer/page.tsx`. */
async function resolveDesignProduct(
  designId: string,
  countryCode: string
): Promise<HttpTypes.StoreProduct | null> {
  try {
    const design = await getMyDesign(designId)
    if (!design?.base_product_id) return null
    const {
      response: { products },
    } = await getProductsList({
      countryCode,
      queryParams: {
        id: design.base_product_id,
        limit: 1,
      } as HttpTypes.StoreProductParams,
    })
    return products[0] ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/customizer-v2`
  const description =
    "Design your garment in a full-screen studio: pick a colour, drop in artwork, and see live pricing."

  return {
    title: "Studio Customizer (Beta)",
    description,
    // Test surface — keep it out of the index until it graduates.
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Studio Customizer (Beta) | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Studio Customizer (Beta) | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function CustomizerV2Page({ params, searchParams }: CustomizerPageProps) {
  const { countryCode } = await params
  const sp = await searchParams
  const handleFromQuery = firstString(sp.handle)
  const reorderRef = firstString(sp.reorder)
  const designId = firstString(sp.design)

  const configuredHandle = getConfiguredCustomizerHandle()

  let customizerProduct: HttpTypes.StoreProduct | null = null

  // Resolution order matches /customizer:
  //   1. ?handle=  2. ?reorder=  3. ?design=  4. env default  5. first shirt-like
  let effectiveHandleFromUrl: string | null = handleFromQuery
  if (!effectiveHandleFromUrl && reorderRef) {
    effectiveHandleFromUrl = await resolveReorderHandle(reorderRef)
  }

  if (effectiveHandleFromUrl) {
    const {
      response: { products: byQuery },
    } = await getProductsList({
      countryCode,
      queryParams: {
        handle: effectiveHandleFromUrl,
        limit: 1,
      } as HttpTypes.StoreProductParams,
    })
    customizerProduct = byQuery[0] ?? null
  }

  if (!customizerProduct && designId) {
    customizerProduct = await resolveDesignProduct(designId, countryCode)
  }

  if (!customizerProduct && configuredHandle) {
    const {
      response: { products: byEnv },
    } = await getProductsList({
      countryCode,
      queryParams: {
        handle: configuredHandle,
        limit: 1,
      } as HttpTypes.StoreProductParams,
    })
    customizerProduct = byEnv[0] ?? null
  }

  if (!customizerProduct) {
    const {
      response: { products: catalog },
    } = await getProductsList({
      countryCode,
      queryParams: {
        limit: 48,
      },
    })
    customizerProduct = findDefaultProduct(catalog)
  }

  if (!customizerProduct) {
    notFound()
  }

  // Region, picker catalog, customer tier, and print profile are independent
  // of one another — resolve them in parallel. The previous waterfall (region
  // → 60-product picker → tier → print profile) pushed the hero image's
  // preload discovery seconds later on every cold render.
  const [region, pickerResult, tier, printProfile, customer] = await Promise.all([
    getRegion(countryCode),
    // Catalog list for the in-customizer "Change product" picker.
    getProductsList({
      countryCode,
      queryParams: {
        limit: 60,
        fields: "id,handle,title,thumbnail",
      } as HttpTypes.StoreProductParams,
    }).catch(() => ({ response: { products: [] as HttpTypes.StoreProduct[] } })),
    getCustomerTier(),
    getPrintProfileForProduct(customizerProduct),
    getCustomer(),
  ])

  if (!region) {
    notFound()
  }

  const pickerProducts = pickerResult.response.products
    .map((p) => ({
      id: p.id,
      handle: p.handle ?? "",
      title: p.title ?? "Untitled",
      thumbnail: p.thumbnail ?? null,
    }))
    .filter((p) => p.handle.length > 0)

  // The colour/size variant pickers are server-rendered and handed to the
  // client customizer so the Assembly "Garment Colour" section reuses the
  // same controls as the real PDP.
  const variantPickersSlot = (
    <Suspense
      fallback={
        <ProductActions
          disabled={true}
          product={customizerProduct}
          region={region}
          hideInlinePurchaseControls
        />
      }
    >
      <ProductActionsWrapper
        id={customizerProduct.id}
        region={region}
        hideInlinePurchaseControls
      />
    </Suspense>
  )

  // Landing photo gallery (the "photos" view shown before the studio opens).
  const gallerySlot = (
    <ImageGallery
      product={customizerProduct}
      images={customizerProduct?.images || []}
      thumbnail={customizerProduct?.thumbnail || null}
      heroLayout
      heroClassName="max-h-[62vh]"
    />
  )

  // The full Assembly studio (canvas + collapsible section menu). Mounted by
  // StudioLauncher only once the customer opens it.
  const studioSlot = (
    <AssemblyLayoutGrid
      customizerSlot={
        <PdpCustomizerBoundary variant="studio">
          <EmbeddedProductCustomizer
            product={customizerProduct}
            assemblyLayout
            integratedPdpSlots={{
              gallery: null,
              variantPickers: variantPickersSlot,
            }}
            pickerProducts={pickerProducts}
            tier={tier}
            customerEmail={customer?.email ?? null}
            printProfile={printProfile}
          />
        </PdpCustomizerBoundary>
      }
    />
  )

  return (
    <>
      <CartEditBanner />
      <div className="content-container py-6" data-testid="customizer-v2-container">
        <PrintPlacementProvider>
          <ProductOptionsProvider product={customizerProduct}>
            <CustomizeModeProvider>
              <StudioLauncher
                title={customizerProduct.title ?? "Customise"}
                // Re-order / saved-design links carry artwork to replay, so open
                // the studio straight away instead of stranding the customer on
                // the photo page (the canvas rehydration runs once it's open).
                autoOpen={Boolean(reorderRef || designId)}
                gallery={gallerySlot}
                colourSelector={<LandingColourSelector product={customizerProduct} />}
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
                productInfo={<ProductInfo product={customizerProduct} hideTitle />}
                studio={studioSlot}
              />
            </CustomizeModeProvider>
          </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>
    </>
  )
}
