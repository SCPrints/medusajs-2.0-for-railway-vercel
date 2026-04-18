import { Metadata } from "next"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { services } from "@modules/services/data"

export const metadata: Metadata = {
  title: "Services",
  description: "Explore our decoration and branding services.",
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

export default function ServicesPage() {
  return (
    <div className="content-container py-14 small:py-20">
      <div className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ui-fg-muted">
          What We Do
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-ui-fg-base small:text-5xl">
          We print. We brand. We help you deliver.
        </h1>
        <p className="mt-4 max-w-3xl text-ui-fg-subtle">
          From high-volume screen printing to premium embroidery and specialty finishes, we help
          you choose the right method for your product, timeline, and budget.
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

      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-ui-fg-base">Our Services</h2>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          Built for brands, events, uniforms, and growing teams that need consistency and quality.
        </p>
      </section>

      <div className="mt-6 grid gap-5">
        {services.map((service) => (
          <article
            key={service.slug}
            className="rounded-xl border border-ui-border-base bg-white p-6 shadow-sm small:p-7"
          >
            <div className="grid gap-5 small:grid-cols-[2fr_1fr] small:gap-7">
              <div>
                <h3 className="text-2xl font-semibold text-ui-fg-base">{service.title}</h3>
                <p className="mt-3 text-sm text-ui-fg-subtle">{service.heroDescription}</p>
                <ul className="mt-4 space-y-2 text-sm text-ui-fg-subtle">
                  {service.bulletPoints.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ui-fg-base" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
                  Production Notes
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
          More Support
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-ui-fg-base">Labels, packaging, logistics</h2>
        <div className="mt-6 grid gap-4 small:grid-cols-3">
          {supportServices.map((item) => (
            <article key={item.title} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
              <h3 className="text-base font-semibold text-ui-fg-base">{item.title}</h3>
              <p className="mt-2 text-sm text-ui-fg-subtle">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-ui-border-base bg-white p-7 small:p-9">
        <h2 className="text-2xl font-semibold text-ui-fg-base">How it works</h2>
        <p className="mt-3 text-sm text-ui-fg-subtle">
          Share your brief, we recommend the right decoration method, and we deliver your order with
          consistent quality from sampling to final run.
        </p>
        <div className="mt-5 grid gap-3 small:grid-cols-3">
          {["1. Choose products", "2. Confirm decoration", "3. Approve and produce"].map((step) => (
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
