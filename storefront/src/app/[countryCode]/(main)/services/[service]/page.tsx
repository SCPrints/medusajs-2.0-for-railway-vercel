import { Metadata } from "next"
import { notFound } from "next/navigation"
import Image from "next/image"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"
import DtfPricingEstimator from "@modules/services/components/dtf-pricing-estimator"
import { getServiceBySlug } from "@modules/services/data"

const SERVICE_PLACEHOLDER_IMAGES_BY_SLUG: Record<string, string[]> = {
  "digital-transfers": Array(3).fill("/placeholders/services/digital-transfers.svg"),
  "uv-printing": Array(3).fill("/placeholders/services/uv-printing.svg"),
}

type ServiceGalleryImage = {
  src: string
  alt: string
  /** Inner frame size vs cell; >1 shows more of the photo (zoom out). */
  frameScale?: number
  /** For framed images, passed to CSS object-position. */
  objectPosition?: string
}

const EMBROIDERY_GALLERY: ServiceGalleryImage[] = [
  {
    src: "/images/services/embroidery/anime-character-grid.png",
    alt: "Collage of detailed anime and character embroidery samples on assorted coloured fabrics.",
    frameScale: 1.14,
    objectPosition: "center center",
  },
  {
    src: "/images/services/embroidery/gundam-mecha-polo.png",
    alt: "Intricate multi-colour mecha embroidery on royal blue pique fabric.",
    frameScale: 1.1,
    objectPosition: "center 24%",
  },
  {
    src: "/images/services/embroidery/snip-society-scissors.png",
    alt: "Detailed gold and silver embroidery on black fabric: crossed scissors, crown, gems, and Snip Society banner lettering.",
    frameScale: 1.22,
    objectPosition: "center center",
  },
]

const SCREEN_PRINTING_GALLERY: ServiceGalleryImage[] = [
  {
    src: "/images/services/screen-printing/onpoint-kitchens.png",
    alt: "Assorted shirt colours showing yellow and white screen-printed Onpoint Kitchens branding and contact details.",
  },
  {
    src: "/images/services/screen-printing/eco-flush-plumbing.png",
    alt: "Black t-shirts with a neon green and white multi-colour screen-printed plumbing services design.",
  },
  {
    src: "/images/services/screen-printing/hitec-drainage-hivis.png",
    alt: "Bulk stack of hi-vis orange workwear with navy screen-printed Hitec Drainage branding.",
  },
]

type Props = {
  params: Promise<{
    countryCode: string
    service: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: serviceSlug, countryCode } = await params
  const service = getServiceBySlug(serviceSlug)

  if (!service) {
    return {
      title: "Service",
    }
  }

  return {
    title: `${service.title} Service`,
    description: service.shortDescription,
    alternates: {
      canonical: `/${countryCode}/services/${service.slug}`,
    },
    openGraph: {
      url: buildAbsoluteUrl(`/${countryCode}/services/${service.slug}`),
      title: `${service.title} | ${SEO.siteName}`,
      description: service.shortDescription,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${service.title} | ${SEO.siteName}`,
      description: service.shortDescription,
      images: [SEO.ogImage],
    },
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { service: serviceSlug } = await params
  const service = getServiceBySlug(serviceSlug)

  if (!service) {
    notFound()
  }

  const galleryImages = buildServiceGalleryImages(service.slug, service.title)

  return (
    <div className="content-container py-14 small:py-20">
      <LocalizedClientLink
        href="/services"
        className="text-sm font-semibold text-ui-fg-base underline underline-offset-4"
      >
        ← Back to services
      </LocalizedClientLink>

      <div className="mt-6">
        <MarketingHero
          eyebrow={service.title}
          eyebrowVariant="muted"
          title={service.title}
          subtitle={service.heroDescription}
        />
      </div>

      <section className="mt-8">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Service Gallery
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ui-fg-base">
            Recent style references
          </h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
          <div className="relative h-[420px] small:h-[520px]">
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0">
              {galleryImages.map((image, index) => {
                const frameScale = image.frameScale ?? 1
                const useFramedCrop =
                  frameScale !== 1 || image.objectPosition !== undefined

                return (
                  <div
                    key={`${service.slug}-gallery-${index}`}
                    className={`relative overflow-hidden ${
                      index === 0 ? "row-span-2" : ""
                    }`}
                  >
                    {useFramedCrop ? (
                      <div className="absolute inset-0 overflow-hidden">
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                          style={{
                            width: `${frameScale * 100}%`,
                            height: `${frameScale * 100}%`,
                          }}
                        >
                          <Image
                            src={image.src}
                            alt={image.alt}
                            fill
                            sizes="(max-width: 1024px) 100vw, 50vw"
                            className="object-cover"
                            style={{
                              objectPosition:
                                image.objectPosition ?? "center center",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className="object-cover object-top"
                      />
                    )}
                  </div>
                )
              })}
              {galleryImages.length < 3 &&
                Array.from({ length: 3 - galleryImages.length }).map((_, index) => (
                  <div key={`${service.slug}-fallback-tile-${index}`} className="bg-ui-bg-base" />
                ))}
            </div>

            <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
              <svg
                className="absolute left-1/2 top-0 h-full w-6 -translate-x-1/2"
                viewBox="0 0 24 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M4 0 L20 100"
                  stroke="white"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <svg
                className="absolute right-0 top-1/2 h-6 w-1/2 -translate-y-1/2"
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 16 L100 8"
                  stroke="white"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-8 large:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-ui-border-base bg-white p-6">
          <h2 className="text-xl font-semibold text-ui-fg-base">Why choose {service.title}?</h2>
          <ul className="mt-4 space-y-3 text-sm text-ui-fg-subtle">
            {service.bulletPoints.map((point) => (
              <li key={point} className="flex gap-3">
                <span className="mt-1 inline-block h-2 w-2 rounded-full bg-ui-fg-base" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="rounded-xl border border-ui-border-base bg-white p-6">
          <h3 className="text-base font-semibold text-ui-fg-base">Not sure which method is right?</h3>
          <p className="mt-3 text-sm text-ui-fg-subtle">
            Tell us your garment, artwork, quantity, and deadline. We will recommend the best
            method and provide a practical quote for production.
          </p>
          <LocalizedClientLink
            href="/contact"
            className="mt-5 inline-flex rounded-lg bg-ui-fg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Request service quote
          </LocalizedClientLink>
        </aside>
      </section>

      {service.pricing ? (
        <section className="mt-8 rounded-xl border border-ui-border-base bg-white p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-ui-fg-base">{service.pricing.title}</h2>
            <p className="mt-1 text-sm text-ui-fg-subtle">{service.pricing.subtitle}</p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-ui-border-base">
            <table className="min-w-full divide-y divide-ui-border-base text-sm">
              <thead className="bg-ui-bg-subtle">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-ui-fg-base">Print area</th>
                  {service.pricing.quantityTiers.map((tier) => (
                    <th key={tier.label} className="px-4 py-3 text-right font-semibold text-ui-fg-base">
                      {tier.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-base">
                {service.pricing.rows.map((row) => (
                  <tr key={row.printAreaLabel}>
                    <th className="px-4 py-3 text-left font-medium text-ui-fg-base">{row.printAreaLabel}</th>
                    {row.pricesByTierCents.map((priceCents, index) => (
                      <td key={`${row.printAreaLabel}-${index}`} className="px-4 py-3 text-right text-ui-fg-subtle">
                        {formatMoney(priceCents, service.pricing.currencyCode)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ui-fg-muted">
            Prices are per garment, per print location. Final quote can vary for specialty garments, extra setup, or
            urgent turnarounds.
          </p>
          <DtfPricingEstimator pricing={service.pricing} />
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 small:grid-cols-3">
        <article className="rounded-xl border border-ui-border-base bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Best for
          </p>
          <p className="mt-2 text-sm text-ui-fg-subtle">{service.bestFor}</p>
        </article>

        <article className="rounded-xl border border-ui-border-base bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Not ideal for
          </p>
          <p className="mt-2 text-sm text-ui-fg-subtle">{service.notIdealFor}</p>
        </article>

        <article className="rounded-xl border border-ui-border-base bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Typical turnaround
          </p>
          <p className="mt-2 text-sm text-ui-fg-subtle">{service.typicalTurnaround}</p>
        </article>
      </section>
    </div>
  )
}

const formatMoney = (amountCents: number, currencyCode: string) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amountCents / 100)

function buildServiceGalleryImages(
  serviceSlug: string,
  serviceTitle: string
): ServiceGalleryImage[] {
  if (serviceSlug === "screen-printing") {
    return SCREEN_PRINTING_GALLERY
  }

  if (serviceSlug === "embroidery") {
    return EMBROIDERY_GALLERY
  }

  const urls =
    SERVICE_PLACEHOLDER_IMAGES_BY_SLUG[serviceSlug] ??
    Array(3).fill("/placeholders/service-1.svg")

  return urls.map((src, index) => ({
    src,
    alt: `${serviceTitle} sample ${index + 1}`,
  }))
}
