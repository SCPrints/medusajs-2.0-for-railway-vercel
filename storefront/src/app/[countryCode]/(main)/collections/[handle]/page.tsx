import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  getHomeSectionByHandle,
  hydrateHomeSections,
} from "@lib/data/home-sections"
import { getRegion } from "@lib/data/regions"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import ProductListingCard from "@modules/products/components/product-listing-card"
import { buildProductListingCardData } from "@modules/products/lib/product-listing-card-data"
import BundleCard from "@modules/bundles/components/bundle-card"

type Params = {
  params: Promise<{ countryCode: string; handle: string }>
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { countryCode, handle } = await params
  const section = await getHomeSectionByHandle(handle)
  if (!section) {
    return { title: "Collection" }
  }

  const canonicalPath = `/${countryCode}/collections/${section.handle}`
  const description =
    section.subtitle ??
    `Shop the ${section.title} range — hand-picked by the SC Prints studio, ready to customise.`

  return {
    title: section.title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${section.title} | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${section.title} | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

/**
 * Full-grid page for one curated home section (`/app/home-sections`). The
 * home page rails' "View all products" link lands here. Reuses the exact same
 * handle→product/bundle hydration the home rail uses (`hydrateHomeSections`),
 * so the grid always matches the rail. 404s for unknown/unpublished handles —
 * `getHomeSectionByHandle` only sees published sections.
 */
export default async function CollectionPage({ params }: Params) {
  const { countryCode, handle } = await params

  const section = await getHomeSectionByHandle(handle)
  if (!section) {
    notFound()
  }

  const region = await getRegion(countryCode)
  if (!region) {
    notFound()
  }

  const [hydrated] = await hydrateHomeSections([section], region.id)
  const items = hydrated?.items ?? []

  return (
    <div className="bg-ui-bg-base">
      <section className="content-container py-12">
        <SectionHeader
          eyebrow={section.subtitle ?? "Shop the range"}
          title={section.title}
        />

        {items.length === 0 ? (
          <div className="mt-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-6 text-center">
            <p className="text-ui-fg-base">
              Nothing in this collection right now.
            </p>
            <p className="mt-1 text-sm text-ui-fg-subtle">
              <LocalizedClientLink
                href="/store"
                className="underline underline-offset-4 hover:text-[var(--brand-secondary)]"
              >
                Browse the full range
              </LocalizedClientLink>{" "}
              instead.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-ui-fg-subtle">
              {items.length} item{items.length !== 1 ? "s" : ""} in this
              collection.
            </p>
            <ul className="grid list-none grid-cols-2 gap-4 p-0 phone:grid-cols-3 tablet:grid-cols-3 small:grid-cols-4">
              {items.map((item, index) => {
                if (item.kind === "bundle") {
                  return (
                    <li key={item.bundle.id}>
                      <BundleCard bundle={item.bundle} />
                    </li>
                  )
                }
                const product = item.product
                const { cheapestPrice } = getProductPrice({ product })
                const data = buildProductListingCardData(product, cheapestPrice)
                return (
                  <li key={product.id}>
                    <ProductListingCard
                      {...data}
                      // First row = likely LCP; fetch eagerly, rest lazy.
                      imagePriority={index < 4}
                    />
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
