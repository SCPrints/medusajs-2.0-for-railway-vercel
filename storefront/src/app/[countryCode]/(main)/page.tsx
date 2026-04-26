import { Metadata } from "next"
import { HttpTypes } from "@medusajs/types"

import {
  getInstagramFeedMedia,
  getInstagramHandleDisplay,
  getInstagramProfileUrl,
} from "@lib/data/instagram"
import { getProductsById, getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import BrandsHero from "@modules/brands/components/brands-hero"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"
import HomeSessionIntro from "@modules/home/components/home-session-intro"
import HowOrderWorksSection from "@modules/home/components/how-order-works-section"
import InstagramFeedStrip from "@modules/home/components/instagram-feed-strip"
import ScrollingPictureBar from "@modules/home/components/scrolling-picture-bar"
import ScrollExpandingSection from "@modules/home/components/scroll-expanding-section"
import {
  DesignIcon,
  DigitalTransferIcon,
  EmbroideryIcon,
  FoldAndBagIcon,
  NeckTagIcon,
  ScreenPrintIcon,
  UvPrintingIcon,
  WarehousingIcon,
} from "@modules/home/components/service-icons"
import Thumbnail from "@modules/products/components/thumbnail"
import ProductTags from "@modules/products/components/product-tags"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import { isColorOptionTitle } from "@modules/products/lib/variant-options"
import { getStoreProductTagValues } from "@lib/util/product-tags"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}`
  const description = SEO.siteDescription

  return {
    title: "Custom Apparel & Branded Merch",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${SEO.siteName} | Custom Apparel & Branded Merch`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${SEO.siteName} | Custom Apparel & Branded Merch`,
      description,
      images: [SEO.ogImage],
    },
  }
}

const VALUE_PROPS = [
  "Volume pricing for teams & businesses",
  "Consistent colour and finish you can trust",
  "Huge range of apparel and promo products",
  "In-house design and digital proofs",
]

const CORE_SERVICES: Array<{
  title: string
  Icon: (props: { className?: string; "aria-hidden"?: boolean }) => JSX.Element
}> = [
  { title: "Screen Print", Icon: ScreenPrintIcon },
  { title: "Digital Transfer", Icon: DigitalTransferIcon },
  { title: "Embroidery", Icon: EmbroideryIcon },
  { title: "Neck Tags", Icon: NeckTagIcon },
  { title: "Fold & Bag", Icon: FoldAndBagIcon },
  { title: "Warehousing & Fulfillment", Icon: WarehousingIcon },
  { title: "UV Printing", Icon: UvPrintingIcon },
  { title: "Design", Icon: DesignIcon },
]

const getMetadataValue = (product: HttpTypes.StoreProduct, keys: string[]) => {
  const metadata = (product.metadata ?? {}) as Record<string, unknown>

  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return null
}

const getColorValues = (product: HttpTypes.StoreProduct) => {
  const colorOptionIds = new Set(
    (product.options ?? [])
      .filter((option) => isColorOptionTitle(option.title))
      .map((option) => option.id)
      .filter(Boolean) as string[]
  )

  const colors = new Set<string>()

  ;(product.variants ?? []).forEach((variant) => {
    ;((variant as any).options ?? []).forEach((optionValue: any) => {
      if (!optionValue?.value) {
        return
      }

      if (!colorOptionIds.size || colorOptionIds.has(optionValue.option_id)) {
        colors.add(String(optionValue.value).trim())
      }
    })
  })

  return Array.from(colors).slice(0, 6)
}

export default async function Home({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const region = await getRegion(countryCode)
  const {
    response: { products },
  } = await getProductsList({
    countryCode,
    queryParams: { limit: 12 },
  })

  if (!region) {
    return null
  }

  const productIds = (products ?? [])
    .map((product) => product.id)
    .filter(Boolean) as string[]
  const pricedProducts = productIds.length
    ? await getProductsById({
        ids: productIds,
        regionId: region.id,
      })
    : []

  const pricedMap = new Map(
    pricedProducts.map((product) => [product.id, product])
  )

  const instagramMedia = await getInstagramFeedMedia()
  const instagramProfileUrl = getInstagramProfileUrl()
  const instagramHandle = getInstagramHandleDisplay()

  const homepagePath = `/${countryCode}`
  const homeStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SEO.siteName,
    url: buildAbsoluteUrl(homepagePath),
    potentialAction: {
      "@type": "SearchAction",
      target: `${buildAbsoluteUrl(
        `/${countryCode}/search`
      )}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  }

  return (
    <HomeSessionIntro>
      <div className="bg-ui-bg-base">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(homeStructuredData),
          }}
        />
        <ScrollingPictureBar />

        <section className="content-container py-12 small:py-16">
          <MarketingHero
            eyebrow="Australian custom decoration"
            title="Branded apparel and merch for teams, workwear, and events"
            subtitle="Screen printing, embroidery, transfers, and more—browse blanks, choose how you want them decorated, and check out online. Built for Australian businesses, clubs, and resellers who need reliable quality at volume."
            subtitleClassName="text-base small:text-lg"
            titleSpacing="relaxed"
            padding="spacious"
          >
            <div className="mt-8">
              <LocalizedClientLink
                href="/store"
                className="inline-flex items-center rounded-lg bg-ui-fg-base px-6 py-3 text-sm font-semibold text-white transition hover:bg-black"
              >
                Browse the catalogue
              </LocalizedClientLink>
            </div>
          </MarketingHero>
        </section>

        <BrandsHero />
        <ScrollExpandingSection />

        <HowOrderWorksSection />

        <section className="content-container py-12">
          <div className="mb-6 flex items-end justify-between">
            <div className="border-l-4 border-[var(--brand-secondary)] pl-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
                Featured range
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-ui-fg-base">
                Popular garments to start your order
              </h2>
            </div>
            <LocalizedClientLink
              href="/store"
              className="text-sm font-semibold text-ui-fg-base underline underline-offset-4"
            >
              View all products
            </LocalizedClientLink>
          </div>

          <ul className="no-scrollbar flex snap-x gap-5 overflow-x-auto pb-2">
            {products.map((product) => {
              const pricedProduct = pricedMap.get(product.id)
              const { cheapestPrice } = pricedProduct
                ? getProductPrice({ product: pricedProduct })
                : { cheapestPrice: null }
              const fabricType = getMetadataValue(product, [
                "fabric_type",
                "fabric",
                "material",
              ])
              const fabricWeight = getMetadataValue(product, [
                "fabric_weight",
                "weight",
                "gsm",
              ])
              const colors = getColorValues(product)
              const tagLabels = getStoreProductTagValues(product)

              return (
                <li
                  key={product.id}
                  className="w-[280px] shrink-0 snap-start rounded-xl border border-ui-border-base bg-white p-4 transition-colors hover:border-[var(--brand-secondary)]/55"
                >
                  <LocalizedClientLink
                    href={`/products/${product.handle}`}
                    className="group block"
                  >
                    <Thumbnail
                      thumbnail={product.thumbnail}
                      images={product.images}
                      size="square"
                      className="rounded-lg"
                    />
                    <h3 className="mt-4 text-base font-semibold text-ui-fg-base">
                      {product.title}
                    </h3>
                    <ProductTags labels={tagLabels} className="mt-2" />
                    <div className="mt-3 space-y-1 text-sm text-ui-fg-subtle">
                      <p>
                        <span className="font-medium text-ui-fg-base">
                          Fabric:
                        </span>{" "}
                        {fabricType ?? "See product details"}
                      </p>
                      <p>
                        <span className="font-medium text-ui-fg-base">
                          Weight:
                        </span>{" "}
                        {fabricWeight ?? "Varies by style"}
                      </p>
                      <p>
                        <span className="font-medium text-ui-fg-base">
                          Price:
                        </span>{" "}
                        {cheapestPrice?.calculated_price ?? "Request quote"} ex
                        GST
                      </p>
                    </div>
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-muted">
                        Available colors
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {colors.length ? (
                          colors.map((colorValue) => (
                            <span
                              key={`${product.id}-${colorValue}`}
                              title={colorValue}
                              className="inline-block h-5 w-5 rounded-full border border-ui-border-base"
                              style={{
                                backgroundColor: resolveGarmentSwatchColor(colorValue),
                              }}
                            />
                          ))
                        ) : (
                          <span className="text-xs text-ui-fg-muted">
                            Color options on product page
                          </span>
                        )}
                      </div>
                    </div>
                  </LocalizedClientLink>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="overflow-hidden border-y border-ui-border-base bg-ui-bg-subtle py-4">
          <div className="value-marquee-track flex min-w-max gap-6 whitespace-nowrap px-6 text-sm font-semibold uppercase tracking-[0.12em] text-ui-fg-base">
            {[...VALUE_PROPS, ...VALUE_PROPS].map((value, index) => (
              <span
                key={`${value}-${index}`}
                className="flex items-center gap-6"
              >
                {value}
                <span className="text-ui-fg-muted">|</span>
              </span>
            ))}
          </div>
        </section>

        <section className="content-container py-14">
          <div className="border-l-4 border-[var(--brand-secondary)] pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
              Decoration &amp; finishing
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ui-fg-base">
              Services we offer on your order
            </h2>
          </div>
          <div className="mt-8 grid gap-4 small:grid-cols-2 large:grid-cols-4">
            {CORE_SERVICES.map((service) => (
              <article
                key={service.title}
                className="rounded-xl border border-ui-border-base bg-white p-5 text-center transition-colors hover:border-[var(--brand-secondary)]/55"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)]">
                  <service.Icon
                    className="h-6 w-6"
                    aria-hidden
                  />
                </div>
                <p className="text-sm font-semibold text-ui-fg-base">
                  {service.title}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="content-container pb-16">
          <div className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
              Prefer to talk it through?
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-ui-fg-base">
              Help for bulk orders, quotes, and artwork
            </h2>
            <p className="mt-4 max-w-3xl text-ui-fg-subtle">
              Ordering online is not always the right fit. Our Victoria-based
              team can help with pricing, garment selection, proofs, and
              production timelines—whether you are kitting out a crew or
              fulfilling a large retail run.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="mailto:info@scprints.com.au"
                className="inline-flex rounded-lg border border-ui-border-base bg-white px-5 py-3 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle"
              >
                Email the team
              </a>
              <LocalizedClientLink
                href="/contact"
                className="inline-flex rounded-lg bg-ui-fg-base px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
              >
                Contact form
              </LocalizedClientLink>
            </div>
          </div>
        </section>

        <InstagramFeedStrip
          items={instagramMedia}
          profileUrl={instagramProfileUrl}
          handleDisplay={instagramHandle}
        />
      </div>
    </HomeSessionIntro>
  )
}
