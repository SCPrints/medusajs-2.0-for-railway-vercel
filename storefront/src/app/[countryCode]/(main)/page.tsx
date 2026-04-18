import { Metadata } from "next"
import { HttpTypes } from "@medusajs/types"

import { getProductsById, getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}`
  const description =
    "Choose your product, select your print method, and place your order with confidence."

  return {
    title: "Custom Apparel & Merchandise",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${SEO.siteName} | Custom Apparel & Merchandise`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${SEO.siteName} | Custom Apparel & Merchandise`,
      description,
      images: [SEO.ogImage],
    },
  }
}

const PROCESS_STEPS = [
  "Choose your product",
  "Pick your print method",
  "Select your print location",
  "Place your order",
]

const VALUE_PROPS = [
  "Volume Discounts",
  "Elite Quality Finish",
  "Australia's Largest Product Range",
  "Proofing & Design Team",
]

const CORE_SERVICES = [
  { title: "Screen Print", icon: "SP" },
  { title: "Digital Transfer", icon: "DT" },
  { title: "Embroidery", icon: "EM" },
  { title: "Neck Tags", icon: "NT" },
  { title: "Fold & Bag", icon: "FB" },
  { title: "Warehousing & Fulfillment", icon: "WF" },
  { title: "UV Printing", icon: "UV" },
  { title: "Design", icon: "DS" },
]

const COLOR_SWATCHES: Record<string, string> = {
  black: "#111827",
  white: "#f9fafb",
  navy: "#1e3a8a",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#15803d",
  yellow: "#facc15",
  orange: "#f97316",
  purple: "#7c3aed",
  pink: "#ec4899",
  grey: "#6b7280",
  gray: "#6b7280",
  charcoal: "#374151",
  cream: "#fef3c7",
  maroon: "#7f1d1d",
}

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
      .filter((option) => /color/i.test(option.title ?? ""))
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

const swatchColor = (colorValue: string) => {
  const normalized = colorValue.toLowerCase()
  return (
    COLOR_SWATCHES[normalized] ??
    COLOR_SWATCHES[normalized.split(" ")[0]] ??
    "#d1d5db"
  )
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

  const productIds = (products ?? []).map((product) => product.id).filter(Boolean) as string[]
  const pricedProducts = productIds.length
    ? await getProductsById({
        ids: productIds,
        regionId: region.id,
      })
    : []

  const pricedMap = new Map(pricedProducts.map((product) => [product.id, product]))
  const homepagePath = `/${countryCode}`
  const homeStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SEO.siteName,
    url: buildAbsoluteUrl(homepagePath),
    potentialAction: {
      "@type": "SearchAction",
      target: `${buildAbsoluteUrl(`/${countryCode}/search`)}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  }

  return (
    <div className="bg-ui-bg-base">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeStructuredData) }}
      />
      <section className="content-container py-12 small:py-16">
        <div className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 shadow-sm small:p-12">
          <span className="inline-flex rounded-full border border-[var(--brand-secondary)]/40 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-secondary)]">
            Custom Apparel Made Simple
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-ui-fg-base small:text-5xl">
            Hero Banner / Order Process
          </h1>
          <p className="mt-4 max-w-3xl text-base text-ui-fg-subtle small:text-lg">
            Choose your product, pick your print method and location, then place your order.
          </p>
          <ol className="mt-8 grid gap-4 small:grid-cols-2 large:grid-cols-4">
            {PROCESS_STEPS.map((step, index) => (
              <li
                key={step}
                className="rounded-xl border border-ui-border-base bg-white p-4 text-sm font-medium text-ui-fg-base"
              >
                <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-secondary)] text-xs font-semibold text-[var(--brand-primary)]">
                  {index + 1}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <LocalizedClientLink
              href="/store"
              className="inline-flex items-center rounded-lg bg-ui-fg-base px-6 py-3 text-sm font-semibold text-white transition hover:bg-black"
            >
              Shop Now
            </LocalizedClientLink>
          </div>
        </div>
      </section>

      <section className="content-container py-12">
        <div className="mb-6 flex items-end justify-between">
          <div className="border-l-4 border-[var(--brand-secondary)] pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
              Shop Top Picks
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ui-fg-base">
              Best Sellers / Product Carousel
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

            return (
              <li
                key={product.id}
                className="w-[280px] shrink-0 snap-start rounded-xl border border-ui-border-base bg-white p-4 transition-colors hover:border-[var(--brand-secondary)]/55"
              >
                <LocalizedClientLink href={`/products/${product.handle}`} className="group block">
                  <Thumbnail
                    thumbnail={product.thumbnail}
                    images={product.images}
                    size="square"
                    className="rounded-lg"
                  />
                  <h3 className="mt-4 text-base font-semibold text-ui-fg-base">{product.title}</h3>
                  <div className="mt-3 space-y-1 text-sm text-ui-fg-subtle">
                    <p>
                      <span className="font-medium text-ui-fg-base">Fabric:</span>{" "}
                      {fabricType ?? "See product details"}
                    </p>
                    <p>
                      <span className="font-medium text-ui-fg-base">Weight:</span>{" "}
                      {fabricWeight ?? "Varies by style"}
                    </p>
                    <p>
                      <span className="font-medium text-ui-fg-base">Price:</span>{" "}
                      {cheapestPrice?.calculated_price ?? "Request quote"} ex GST
                    </p>
                    <p className="font-semibold text-ui-fg-base">
                      Buy custom from {cheapestPrice?.calculated_price ?? "Request quote"}
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
                            style={{ backgroundColor: swatchColor(colorValue) }}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-ui-fg-muted">Color options on product page</span>
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
            <span key={`${value}-${index}`} className="flex items-center gap-6">
              {value}
              <span className="text-ui-fg-muted">|</span>
            </span>
          ))}
        </div>
      </section>

      <section className="content-container py-14">
        <div className="border-l-4 border-[var(--brand-secondary)] pl-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            What We Offer
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ui-fg-base">Core Services Grid</h2>
        </div>
        <div className="mt-8 grid gap-4 small:grid-cols-2 large:grid-cols-4">
          {CORE_SERVICES.map((service) => (
            <article
              key={service.title}
              className="rounded-xl border border-ui-border-base bg-white p-5 text-center transition-colors hover:border-[var(--brand-secondary)]/55"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-secondary)]/15 text-2xl text-[var(--brand-secondary)]">
                {service.icon}
              </div>
              <p className="text-sm font-semibold text-ui-fg-base">{service.title}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-container pb-16">
        <div className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Need a Helping Hand?
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-ui-fg-base">
            Guided Support for B2B & Large Orders
          </h2>
          <p className="mt-4 max-w-3xl text-ui-fg-subtle">
            If self-checkout is not your thing, our Victoria-based support team can guide you from
            quote to proofing and production.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="mailto:info@scprints.com.au"
              className="inline-flex rounded-lg border border-ui-border-base bg-white px-5 py-3 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle"
            >
              Chat via Email
            </a>
            <LocalizedClientLink
              href="/contact"
              className="inline-flex rounded-lg border border-ui-border-base bg-white px-5 py-3 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle"
            >
              Submit a Form
            </LocalizedClientLink>
            <a
              href="tel:+61390000000"
              className="inline-flex rounded-lg bg-ui-fg-base px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
            >
              Call Victoria Team
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
