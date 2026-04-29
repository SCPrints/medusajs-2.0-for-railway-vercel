import { Metadata } from "next"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import ContactForm from "@modules/contact/components/contact-form"
import ContactMap from "@modules/contact/components/contact-map"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"
import SessionIntro from "@modules/home/components/home-session-intro"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/contact`
  const description = "Get in touch with the SC PRINTS team for quotes, support, and order advice."

  return {
    title: "Contact Us",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Contact Us | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Contact Us | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const contactPath = `/${countryCode}/contact`
  const contactStructuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: `Contact ${SEO.siteName}`,
    url: buildAbsoluteUrl(contactPath),
    mainEntity: {
      "@type": "Organization",
      name: SEO.siteName,
      email: SEO.contactEmail,
      telephone: SEO.contactPhone,
      areaServed: "AU",
    },
  }

  return (
    <SessionIntro>
      <div className="content-container py-14 small:py-20">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(contactStructuredData) }}
        />
        <div className="mb-12">
          <MarketingHero
            align="center"
            eyebrow="Customer support"
            title="Contact Us"
            subtitle="Have a question about our products or your order? We're here to help."
            subtitleClassName="text-lg"
          >
            <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 text-sm text-ui-fg-subtle">
              <span>Need an instant answer?</span>
              <LocalizedClientLink
                href="/faq"
                className="font-semibold text-[var(--brand-secondary)] hover:text-[var(--brand-accent)] hover:underline"
              >
                Check our Frequently Asked Questions
              </LocalizedClientLink>
            </div>
          </MarketingHero>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-2 lg:gap-16">
          {/* LEFT COLUMN: Contact Form */}
          <ContactForm />

          {/* RIGHT COLUMN: Map + Store Hours */}
          <div className="flex flex-col gap-6">
            <ContactMap />

            <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-6 text-center">
              <h3 className="mb-1 font-bold text-ui-fg-base">Store Hours</h3>
              <p className="text-sm text-[var(--brand-secondary)]">
                Monday - Friday: 9:00am - 5:00pm AEST
              </p>
            </div>
          </div>
        </div>
      </div>
    </SessionIntro>
  )
}