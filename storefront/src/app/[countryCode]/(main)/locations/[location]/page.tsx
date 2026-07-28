import { Metadata } from "next"
import { notFound } from "next/navigation"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO, STUDIO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getLocation, locations } from "@modules/locations/data/locations"

type Props = {
  params: Promise<{
    countryCode: string
    location: string
  }>
}

export async function generateStaticParams() {
  return locations.map((l) => ({ location: l.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { location: slug, countryCode } = await params
  const location = getLocation(slug)

  if (!location) {
    return { title: "Location" }
  }

  const path = `/${countryCode}/locations/${location.slug}`
  // Root layout applies `template: "%s | SC PRINTS"` to `title` — so `title`
  // must NOT carry the suffix. The template does not apply to og/twitter, so
  // those spell it out.
  const socialTitle = `${location.title} | ${SEO.siteName}`

  return {
    title: location.title,
    description: location.description,
    alternates: { canonical: path },
    openGraph: {
      url: buildAbsoluteUrl(path),
      title: socialTitle,
      description: location.description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: socialTitle,
      description: location.description,
      images: [SEO.ogImage],
    },
  }
}

export default async function LocationPage({ params }: Props) {
  const { location: slug, countryCode } = await params
  const location = getLocation(slug)

  if (!location) notFound()

  const others = locations.filter((l) => l.slug !== location.slug)
  const path = `/${countryCode}/locations/${location.slug}`

  // LocalBusiness is the schema that actually feeds the local pack. `areaServed`
  // is what tells Google this page covers a suburb we don't sit in — without it
  // a suburb page reads as a duplicate of the studio's own listing.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: STUDIO.legalName,
    description: location.description,
    url: buildAbsoluteUrl(path),
    telephone: SEO.contactPhone,
    email: SEO.contactEmail,
    image: buildAbsoluteUrl(SEO.ogImage),
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: STUDIO.streetAddress,
      addressLocality: STUDIO.suburb,
      addressRegion: STUDIO.state,
      postalCode: STUDIO.postcode,
      addressCountry: STUDIO.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: STUDIO.latitude,
      longitude: STUDIO.longitude,
    },
    openingHours: STUDIO.openingHours,
    areaServed: [location.suburb, ...location.nearby].map((name) => ({
      "@type": "Place",
      name: `${name}, ${STUDIO.state}`,
    })),
  }

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: buildAbsoluteUrl(`/${countryCode}`) },
      {
        "@type": "ListItem",
        position: 2,
        name: "Locations",
        item: buildAbsoluteUrl(`/${countryCode}/locations`),
      },
      { "@type": "ListItem", position: 3, name: location.suburb, item: buildAbsoluteUrl(path) },
    ],
  }

  return (
    <div className="content-container py-10 small:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }}
      />

      <section className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.18em] text-ui-fg-muted">
          {location.region}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ui-fg-base small:text-4xl">
          {location.title}
        </h1>
        <p className="mt-4 text-base text-ui-fg-subtle small:text-lg">
          {location.intro}
        </p>
        <p className="mt-4 text-base text-ui-fg-subtle small:text-lg">
          {location.serving}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <LocalizedClientLink
            href={`/contact?location=${location.slug}`}
            className="rounded-full bg-[var(--brand-secondary)] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--brand-accent)]"
          >
            Get a quote for {location.suburb}
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/customizer"
            className="rounded-full border border-ui-border-base px-6 py-3 text-base font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
          >
            Design it yourself
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/store"
            className="rounded-full border border-ui-border-base px-6 py-3 text-base font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
          >
            Browse apparel
          </LocalizedClientLink>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-ui-fg-base">
          What we print for {location.suburb}
        </h2>
        <div className="mt-6 grid gap-6 small:grid-cols-3">
          {location.useCases.map((useCase) => (
            <div
              key={useCase.heading}
              className="rounded-2xl border border-ui-border-base bg-white p-6 transition-shadow hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-ui-fg-base">
                {useCase.heading}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
                {useCase.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-6 small:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-ui-fg-base">
          Our studio
        </h2>
        <p className="mt-3 text-base text-ui-fg-subtle">
          {STUDIO.streetAddress}, {STUDIO.suburb} {STUDIO.state} {STUDIO.postcode}
          {" — "}
          {location.travel}.
        </p>
        <p className="mt-2 text-base text-ui-fg-subtle">
          Screen printing, DTF, DTG and embroidery, all in-house. From a single
          garment, with bulk pricing as the run grows.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <a
            href={`tel:${SEO.contactPhone}`}
            className="font-medium !text-[var(--brand-secondary)] hover:underline"
          >
            {SEO.contactPhone}
          </a>
          <a
            href={`mailto:${SEO.contactEmail}`}
            className="font-medium !text-[var(--brand-secondary)] hover:underline"
          >
            {SEO.contactEmail}
          </a>
        </div>
      </section>

      <section className="mt-14 border-t border-ui-border-base pt-10">
        <h2 className="text-xl font-semibold tracking-tight text-ui-fg-base">
          Also serving
        </h2>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          {location.nearby.join(" · ")}
        </p>

        {others.length > 0 ? (
          <>
            <h3 className="mt-8 text-base font-semibold text-ui-fg-base">
              Other areas we print for
            </h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {others.map((l) => (
                <li key={l.slug}>
                  <LocalizedClientLink
                    href={`/locations/${l.slug}`}
                    className="rounded-full border border-ui-border-base px-4 py-2 text-sm text-ui-fg-subtle transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base"
                  >
                    {l.suburb}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  )
}
