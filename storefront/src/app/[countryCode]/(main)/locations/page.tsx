import { Metadata } from "next"

import { buildAbsoluteUrl, SEO, STUDIO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { locations } from "@modules/locations/data/locations"

// Root layout applies `template: "%s | SC PRINTS"` to `title`, so TITLE stays
// bare; og/twitter don't get the template and spell the site name out.
const TITLE = "Printing & Embroidery Across Sydney"
const SOCIAL_TITLE = `${TITLE} | ${SEO.siteName}`
const DESCRIPTION =
  "SC Prints is a South West Sydney studio printing custom apparel, workwear and uniforms for Liverpool, Fairfield, Cabramatta, Bankstown and beyond."

export async function generateMetadata({
  params,
}: {
  params: Promise<{ countryCode: string }>
}): Promise<Metadata> {
  const { countryCode } = await params
  const path = `/${countryCode}/locations`

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: path },
    openGraph: {
      url: buildAbsoluteUrl(path),
      title: SOCIAL_TITLE,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
    twitter: {
      title: SOCIAL_TITLE,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
  }
}

export default function LocationsPage() {
  return (
    <div className="content-container py-10 small:py-16">
      <section className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.18em] text-ui-fg-muted">
          Where we print
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ui-fg-base small:text-4xl">
          Custom printing across Sydney
        </h1>
        <p className="mt-4 text-base text-ui-fg-subtle small:text-lg">
          Our studio is at {STUDIO.streetAddress}, {STUDIO.suburb}{" "}
          {STUDIO.state} {STUDIO.postcode} — screen printing, DTF, DTG and
          embroidery all under one roof. We ship Australia-wide, but if you&apos;re
          local you can drop in, check a sample and collect in person.
        </p>
      </section>

      <section className="mt-12 grid gap-5 small:grid-cols-2 medium:grid-cols-3">
        {locations.map((location) => (
          <LocalizedClientLink
            key={location.slug}
            href={`/locations/${location.slug}`}
            className="group rounded-2xl border border-ui-border-base bg-white p-6 transition-shadow hover:shadow-md"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-ui-fg-muted">
              {location.region}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-ui-fg-base">
              {location.suburb}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              {location.description}
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-[var(--brand-secondary)]">
              View {location.suburb} →
            </span>
          </LocalizedClientLink>
        ))}
      </section>
    </div>
  )
}
