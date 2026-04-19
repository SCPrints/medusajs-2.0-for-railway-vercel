import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import BrandsHero from "@modules/brands/components/brands-hero"
import { BRAND_TILES } from "@modules/brands/data/brands"

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
  return (
    <>
      <BrandsHero />

      <section className="content-container border-t border-ui-border-base py-16 small:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-ui-fg-base">
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
