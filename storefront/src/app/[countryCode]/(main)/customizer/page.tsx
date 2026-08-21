import { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { HttpTypes } from "@medusajs/types"
import { getCustomerTier } from "@lib/data/customer-tier"
import { getCustomer } from "@lib/data/customer"
import { toCustomerContact } from "@modules/customizer/lib/customer-contact"
import { getMyDesign } from "@lib/data/designs"
import { retrieveOrder } from "@lib/data/orders"
import { getProductsList } from "@lib/data/products"
import { getPrintProfileForProduct } from "@lib/data/print-profiles"
import { getRegion } from "@lib/data/regions"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import CartEditBanner from "@modules/customizer/components/cart-edit-banner"
import EmbeddedProductCustomizer from "@modules/customizer/components/embedded-product-customizer"
import ImageGallery from "@modules/products/components/image-gallery"
import PdpCustomizerBoundary from "@modules/products/components/pdp-customizer-boundary"
import PdpLayoutGrid from "@modules/products/components/pdp-layout-grid"
import PdpSplitTabs from "@modules/products/components/pdp-split-tabs"
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
    /** Alias for `handle` used by the admin "Create revised proof" widget. */
    product?: string | string[]
    /** "<orderId>:<lineItemId>" — re-order from order history. */
    reorder?: string | string[]
    /** Saved-design id for the "Edit / re-order" link from /account/designs. */
    design?: string | string[]
    /** Admin "Create revised proof": "<orderId>:<lineItemId>:<side>". When set,
     *  the page renders a chromeless internal editor (no storefront nav/footer/
     *  chat, no PDP gallery/info/tabs) so staff can adjust + Save Proof. */
    adminProof?: string | string[]
    proofArtwork?: string | string[]
    variant?: string | string[]
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

/**
 * Resolves the product handle to load when the customer arrives via
 * `?reorder=<orderId>:<lineItemId>`. Without this, the customizer page would
 * fall back to the configured default product (or the first shirt-like one)
 * and the customer would see — for example — a duffel bag when they were
 * trying to re-order a Staple Tee. The actual canvas state still hydrates
 * client-side via the rehydration effect, but it has to land on the right
 * product first.
 */
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

/**
 * Same as the reorder resolver but for `?design=<id>` (re-edit a design saved
 * from "My Designs"). Looks up the design's `base_product_id` and converts to
 * a handle via the products API.
 */
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
  const canonicalPath = `/${countryCode}/customizer`
  const description =
    "Upload your logo and position it on a garment mockup with a live drag-and-resize customizer."

  return {
    title: "Logo Customizer",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Logo Customizer | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Logo Customizer | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function CustomizerPage({ params, searchParams }: CustomizerPageProps) {
  const { countryCode } = await params
  const sp = await searchParams
  // `product` is the param the admin "Create revised proof" widget sends; the
  // rest of the app uses `handle`. Accept both so the proof opens on the right
  // garment regardless of which side has deployed.
  const handleFromQuery = firstString(sp.handle) ?? firstString(sp.product)
  const reorderRef = firstString(sp.reorder)
  const designId = firstString(sp.design)
  // Proof mode = the admin "Create revised proof" iframe. Render a clean,
  // internal-only editor (no storefront chrome / PDP content).
  const isProofMode = !!firstString(sp.adminProof)

  const configuredHandle = getConfiguredCustomizerHandle()

  let customizerProduct: HttpTypes.StoreProduct | null = null

  // Resolution order:
  //   1. Explicit ?handle= (deep link / "Change product" picker)
  //   2. ?reorder=<orderId>:<lineItemId> → original line's product
  //   3. ?design=<savedId> → saved design's base product
  //   4. Configured env default
  //   5. First shirt-like product in catalog
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
    // Catalog list for the in-customizer "Change product" picker — same
    // behavior as before so customers who land here directly can switch
    // garments without back-buttoning to the catalog.
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

  // Slots are server-rendered then handed to the client customizer template so
  // the gallery + variant pickers participate in the same unified PDP layout
  // grid as on real product pages.
  const gallerySlot = (
    <ImageGallery
      product={customizerProduct}
      images={customizerProduct?.images || []}
      thumbnail={customizerProduct?.thumbnail || null}
      heroLayout
      heroClassName="max-h-[55vh]"
    />
  )

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

  // ── Admin "Create revised proof": chromeless internal editor ──────────────
  // A fixed full-viewport overlay covers the (main) layout's nav/footer/chat
  // (which this page cannot unmount — they're rendered by an ancestor layout),
  // and we skip the PDP wrappers (h1, Photos/gallery tabs, ProductInfo) so staff
  // see ONLY the customizer. integratedPdpSlots is kept (gallery omitted) so the
  // editor uses the same known-good wizard layout that already works in proof
  // mode — just without the surrounding storefront page.
  if (isProofMode) {
    return (
      <div
        className="fixed inset-0 z-[9999] overflow-y-auto bg-ui-bg-base"
        data-testid="customizer-proof-shell"
      >
        <div className="mx-auto max-w-[1400px] px-3 py-4">
          <PrintPlacementProvider>
            <ProductOptionsProvider product={customizerProduct}>
              <CustomizeModeProvider>
                <PdpLayoutGrid
                  customizerSlot={
                    <PdpCustomizerBoundary>
                      <EmbeddedProductCustomizer
                        product={customizerProduct}
                        integratedPdpSlots={{
                          gallery: null,
                          variantPickers: variantPickersSlot,
                        }}
                        pickerProducts={pickerProducts}
                        tier={tier}
                        customerContact={toCustomerContact(customer)}
                        printProfile={printProfile}
                      />
                    </PdpCustomizerBoundary>
                  }
                />
              </CustomizeModeProvider>
            </ProductOptionsProvider>
          </PrintPlacementProvider>
        </div>
      </div>
    )
  }

  return (
    <>
      <CartEditBanner />
      <div className="content-container py-6 relative" data-testid="customizer-container">
        <PrintPlacementProvider>
        <ProductOptionsProvider product={customizerProduct}>
          <CustomizeModeProvider>
            {/* Just the garment name above the customizer so the page
                always has a visible title; full tags + description
                live in ProductInfo below. */}
            <h1
              className="mb-4 text-3xl font-semibold leading-tight text-ui-fg-base lg:text-4xl"
              data-testid="product-title"
            >
              {customizerProduct.title}
            </h1>

            {/* Two top-level tabs: Photos (default) and Customise this
                garment. Same split-tabs layout as the PDP. */}
            <PdpSplitTabs
              gallery={gallerySlot}
              variantPickers={variantPickersSlot}
              designContent={
                <PdpLayoutGrid
                  customizerSlot={
                    <PdpCustomizerBoundary>
                      <EmbeddedProductCustomizer
                        product={customizerProduct}
                        integratedPdpSlots={{
                          gallery: null,
                          variantPickers: variantPickersSlot,
                        }}
                        pickerProducts={pickerProducts}
                        tier={tier}
                        customerContact={toCustomerContact(customer)}
                        printProfile={printProfile}
                      />
                    </PdpCustomizerBoundary>
                  }
                />
              }
            />
            <div className="mt-12">
              <ProductInfo product={customizerProduct} hideTitle />
            </div>
          </CustomizeModeProvider>
        </ProductOptionsProvider>
        </PrintPlacementProvider>
      </div>
    </>
  )
}
