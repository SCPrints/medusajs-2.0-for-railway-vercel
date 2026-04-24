import { Metadata } from "next"

import { getGraphSummary } from "@lib/data/graph"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import BrandsHero from "@modules/brands/components/brands-hero"
import { BRAND_TILES } from "@modules/brands/data/brands"
import { BrandsGraphPreview } from "@modules/graph/components/brands-graph-preview"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/brands`
  const description =
    "Apparel and headwear brands we print and embroider for — from wholesale blanks to retail names."

  return {
    title: "Brands",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Brands | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Brands | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function BrandsPage() {
  /**
   * Load the catalog graph summary for the preview embed. The `/store/graph`
   * summary payload is tiny (root + brand + category super-nodes) and is
   * cached via Next.js fetch tags, so we share the same cache with `/explore`.
   * If the backend is unreachable we silently degrade — the text list below
   * still renders and tells the full story.
   */
  let graphSummary = null
  try {
    graphSummary = await getGraphSummary()
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("BrandsPage: failed to load graph summary", error)
    }
  }

  return (
    <>
      <BrandsHero />

      {graphSummary ? (
        <section className="content-container border-t border-ui-border-base py-16 small:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-ui-fg-base">
              Explore the catalog
            </h2>
            <p className="mt-3 text-ui-fg-subtle">
              Each dot is a brand in our catalog. Click one to open the full interactive map of
              its products and categories.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-5xl">
            <BrandsGraphPreview summary={graphSummary} />
            <div className="mt-4 flex justify-center">
              <LocalizedClientLink
                href="/explore"
                className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-small-regular text-ui-fg-base hover:bg-ui-bg-subtle"
              >
                Open full catalog graph
              </LocalizedClientLink>
            </div>
          </div>
        </section>
      ) : null}

      <section className="content-container border-t border-ui-border-base py-16 small:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ui-fg-base">
            Full list
          </h2>
          <p className="mt-3 text-ui-fg-subtle">
            We source quality garments and caps from trusted suppliers. Tell us your brand or
            garment code when you request a quote.
          </p>
        </div>
        <ul className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 small:grid-cols-3 md:grid-cols-4">
          {BRAND_TILES.map((b) => (
            <li
              key={b.id}
              className="rounded-xl border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-center text-small-regular text-ui-fg-base"
            >
              {b.name}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
