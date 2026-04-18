import { Metadata } from "next"
import { notFound } from "next/navigation"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getServiceBySlug, services } from "@modules/services/data"

const SERVICE_PLACEHOLDER_IMAGES_BY_SLUG: Record<string, string[]> = {
  "screen-printing": Array(3).fill("/placeholders/services/screen-printing.svg"),
  embroidery: Array(3).fill("/placeholders/services/embroidery.svg"),
  "digital-transfers": Array(3).fill("/placeholders/services/digital-transfers.svg"),
  "uv-printing": Array(3).fill("/placeholders/services/uv-printing.svg"),
}

type Props = {
  params: Promise<{
    countryCode: string
    service: string
  }>
}

export async function generateStaticParams() {
  return services.map((service) => ({ service: service.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: serviceSlug } = await params
  const service = getServiceBySlug(serviceSlug)

  if (!service) {
    return {
      title: "Service",
    }
  }

  return {
    title: `${service.title} | Services`,
    description: service.shortDescription,
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { service: serviceSlug } = await params
  const service = getServiceBySlug(serviceSlug)

  if (!service) {
    notFound()
  }

  const galleryImages = buildServiceGalleryImages(service.slug)

  return (
    <div className="content-container py-14 small:py-20">
      <LocalizedClientLink
        href="/services"
        className="text-sm font-semibold text-ui-fg-base underline underline-offset-4"
      >
        ← Back to services
      </LocalizedClientLink>

      <div className="mt-6 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
          Service Detail
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-ui-fg-base">{service.title}</h1>
        <p className="mt-4 max-w-3xl text-ui-fg-subtle">{service.heroDescription}</p>
      </div>

      <section className="mt-8">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Service Gallery
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ui-fg-base">
            Service examples with comic-panel split grid
          </h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
          <div className="relative h-[420px] small:h-[520px]">
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0">
              {galleryImages.map((imageUrl, index) => (
                <div
                  key={`${service.slug}-gallery-${index}`}
                  className={`relative overflow-hidden ${
                    index === 0 ? "row-span-2" : ""
                  }`}
                >
                  <Image
                    src={imageUrl}
                    alt={`${service.title} sample ${index + 1}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover object-top"
                  />
                </div>
              ))}
              {/* Fallback tiles in case image configuration changes */}
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
          <h3 className="text-base font-semibold text-ui-fg-base">Need help deciding?</h3>
          <p className="mt-3 text-sm text-ui-fg-subtle">
            Our Victoria-based team can help you choose the best print method for your artwork and
            garment selection.
          </p>
          <LocalizedClientLink
            href="/contact"
            className="mt-5 inline-flex rounded-lg bg-ui-fg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Contact our team
          </LocalizedClientLink>
        </aside>
      </section>
    </div>
  )
}

function buildServiceGalleryImages(serviceSlug: string) {
  return (
    SERVICE_PLACEHOLDER_IMAGES_BY_SLUG[serviceSlug] ?? Array(3).fill("/placeholders/service-1.svg")
  )
}
