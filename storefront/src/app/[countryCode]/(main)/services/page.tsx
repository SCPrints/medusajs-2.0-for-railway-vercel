import { Metadata } from "next"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { services } from "@modules/services/data"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/services`
  const description =
    "Explore screen printing, embroidery, digital transfers, and UV printing services for Australian brands and teams."

  return {
    title: "Services",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Services | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Services | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

const serviceMinimums: Record<string, string> = {
  "screen-printing": "Minimum run: 50 units",
  "digital-transfers": "Minimum run: 1 unit",
  embroidery: "Minimum run: 1 unit",
  "uv-printing": "Minimum run: Custom quoted",
}

const supportServices = [
  {
    title: "Labels",
    description:
      "Custom neck labels, hem labels, and relabeling support to give your products a premium branded finish.",
  },
  {
    title: "Packaging",
    description:
      "Fold-and-bag services with options for customer-provided tags, stickers, and barcode inserts.",
  },
  {
    title: "Logistics",
    description:
      "Australia-wide dispatch with coordinated delivery options to your site, event, or fulfilment center.",
  },
]

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const servicesPath = `/${countryCode}/services`
  const serviceListStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SEO.siteName} Services`,
    itemListElement: services.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: service.title,
        description: service.shortDescription,
        url: buildAbsoluteUrl(`${servicesPath}/${service.slug}`),
        areaServed: "AU",
        provider: {
          "@type": "Organization",
          name: SEO.siteName,
        },
      },
    })),
  }

  return (
    <div className="content-container py-14 small:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceListStructuredData) }}
      />
      <div className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
        <p className="inline-flex rounded-full border border-[#FF6B35]/40 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#FF6B35]">
          SC PRINTS Services
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-ui-fg-base small:text-5xl">
          Decoration services built for brands, teams, and uniforms
        </h1>
        <p className="mt-4 max-w-3xl text-ui-fg-subtle">
          Whether you need large production runs, premium stitched logos, or flexible short-run
          options, we match each job to the right print method for quality, turnaround, and budget.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <LocalizedClientLink
            href="/contact"
            className="inline-flex rounded-lg bg-ui-fg-base px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
          >
            Get a quote
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/store"
            className="inline-flex rounded-lg border border-ui-border-base bg-white px-5 py-2.5 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-base"
          >
            Start shopping blanks
          </LocalizedClientLink>
        </div>
      </div>

      <section className="mt-12 border-l-4 border-[#FF6B35] pl-4">
        <h2 className="text-2xl font-semibold text-ui-fg-base">Core Decoration Services</h2>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          Compare each process, minimums, and best-use scenarios before selecting your service.
        </p>
      </section>

      <div className="mt-6 grid gap-5">
        {services.map((service) => (
          <article
            key={service.slug}
            className="rounded-xl border border-ui-border-base bg-white p-6 shadow-sm transition-colors hover:border-[#FF6B35]/55 small:p-7"
          >
            <div className="grid gap-5 small:grid-cols-[2fr_1fr] small:gap-7">
              <div>
                <h3 className="text-2xl font-semibold text-ui-fg-base">{service.title}</h3>
                <p className="mt-3 text-sm text-ui-fg-subtle">{service.heroDescription}</p>
                <ul className="mt-4 space-y-2 text-sm text-ui-fg-subtle">
                  {service.bulletPoints.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#FF6B35]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-[#FF6B35]/35 bg-ui-bg-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
                  Best Fit
                </p>
                <p className="mt-3 text-sm font-semibold text-ui-fg-base">
                  {serviceMinimums[service.slug] ?? "Minimum run: Custom quoted"}
                </p>
                <p className="mt-2 text-sm text-ui-fg-subtle">{service.shortDescription}</p>
                <LocalizedClientLink
                  href={`/services/${service.slug}`}
                  className="mt-4 inline-flex text-sm font-semibold text-ui-fg-base underline underline-offset-4"
                >
                  View service details
                </LocalizedClientLink>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-12 rounded-2xl border border-ui-border-base bg-white p-7 small:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
          Extra Services
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-ui-fg-base">
          Labels, packing, and delivery support
        </h2>
        <div className="mt-6 grid gap-4 small:grid-cols-3">
          {supportServices.map((item) => (
            <article
              key={item.title}
              className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 transition-colors hover:border-[#FF6B35]/55"
            >
              <h3 className="text-base font-semibold text-ui-fg-base">{item.title}</h3>
              <p className="mt-2 text-sm text-ui-fg-subtle">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-ui-border-base bg-white p-7 small:p-9">
        <h2 className="text-2xl font-semibold text-ui-fg-base">How your order moves through production</h2>
        <p className="mt-3 text-sm text-ui-fg-subtle">
          Send your brief, approve your setup, and our team manages production through to dispatch
          with quality checks at each stage.
        </p>
        <div className="mt-5 grid gap-3 small:grid-cols-3">
          {[
            "1. Share your products and artwork",
            "2. Confirm method, placement, and pricing",
            "3. Approve and move to production",
          ].map((step) => (
            <div key={step} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3.5">
              <p className="text-sm font-semibold text-ui-fg-base">{step}</p>
            </div>
          ))}
        </div>
        <LocalizedClientLink
          href="/contact"
          className="mt-6 inline-flex rounded-lg bg-ui-fg-base px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
        >
          Get a quote
        </LocalizedClientLink>
      </section>
    </div>
  )
}
