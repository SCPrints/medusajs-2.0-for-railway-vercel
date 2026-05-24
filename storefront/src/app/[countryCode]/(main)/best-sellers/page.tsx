import { Metadata } from "next"

import { MEDUSA_BACKEND_URL } from "@lib/config"
import { getProductsById } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import ProductListingCard from "@modules/products/components/product-listing-card"
import { buildProductListingCardData } from "@modules/products/lib/product-listing-card-data"
import { HttpTypes } from "@medusajs/types"

const TOP_SELLING_WINDOW_DAYS = 30
const TOP_SELLING_LIMIT = 24

const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

// Mirrors the side-menu's top-selling fetch (nav/index.tsx). Keeping it local
// avoids coupling the page to the nav's data layer — if either evolves the
// other still works.
async function fetchTopSellingProducts(
  regionId: string
): Promise<HttpTypes.StoreProduct[]> {
  const params = new URLSearchParams({
    days: String(TOP_SELLING_WINDOW_DAYS),
    limit: String(TOP_SELLING_LIMIT),
    region_id: regionId,
  })
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (publishableKey) headers["x-publishable-api-key"] = publishableKey
  try {
    const res = await fetch(
      `${MEDUSA_BACKEND_URL}/store/products/top-selling?${params.toString()}`,
      {
        headers,
        next: { tags: ["top-selling-products"], revalidate: 1800 },
      }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      products?: HttpTypes.StoreProduct[]
    }
    return data.products ?? []
  } catch {
    return []
  }
}

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/best-sellers`
  const description =
    "Real top-sellers across the SC Prints catalog from the last 30 days, refreshed every 30 minutes."

  return {
    title: "Best Sellers — what teams order most",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${SEO.siteName} | Best Sellers`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${SEO.siteName} | Best Sellers`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function BestSellersPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const topSelling = await fetchTopSellingProducts(region.id)

  // Re-fetch with pricing for the region so the card prices match what the
  // checkout will charge. The top-selling endpoint returns id/handle/title
  // metadata but not necessarily the region-priced variants.
  const productIds = topSelling
    .map((product) => product.id)
    .filter((id): id is string => !!id)
  const pricedProducts = productIds.length
    ? await getProductsById({
        ids: productIds,
        regionId: region.id,
      })
    : []
  const pricedMap = new Map(
    pricedProducts.map((product) => [product.id, product])
  )

  return (
    <div className="bg-ui-bg-base">
      <section className="content-container py-12">
        <SectionHeader
          eyebrow="Most popular"
          title="Best Sellers — what teams order most"
        />
        <p className="mb-6 max-w-2xl text-sm text-ui-fg-subtle">
          Live ranking of the top {TOP_SELLING_LIMIT} garments from the last{" "}
          {TOP_SELLING_WINDOW_DAYS} days. Refreshed every 30 minutes.
        </p>

        {topSelling.length === 0 ? (
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-6 text-center">
            <p className="text-ui-fg-base">
              Not enough recent orders yet to rank a leaderboard.
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
          <ul className="grid list-none grid-cols-2 gap-4 p-0 phone:grid-cols-3 tablet:grid-cols-3 small:grid-cols-4">
            {topSelling.map((product) => {
              const pricedProduct = product.id
                ? pricedMap.get(product.id)
                : undefined
              const { cheapestPrice } = pricedProduct
                ? getProductPrice({ product: pricedProduct })
                : { cheapestPrice: null }
              const data = buildProductListingCardData(
                pricedProduct ?? product,
                cheapestPrice
              )
              return (
                <li key={product.id}>
                  <ProductListingCard {...data} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
