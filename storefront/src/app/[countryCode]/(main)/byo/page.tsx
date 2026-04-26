import { Metadata } from "next"
import { Lora } from "next/font/google"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ByoInquiryForm from "@modules/home/components/byo-inquiry-form"
import ScrollExpandingSection from "@modules/home/components/scroll-expanding-section"

const lora = Lora({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
})

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/byo`
  const description =
    "How bring-your-own (BYO) works at SC PRINTS: bring garments or source something outside our online catalogue, and we decorate them for you."

  return {
    title: "BYO: Bring your own merch",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `BYO: Bring your own merch | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `BYO: Bring your own merch | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function ByoPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const pagePath = `/${countryCode}/byo`
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `BYO: Bring your own merch | ${SEO.siteName}`,
    url: buildAbsoluteUrl(pagePath),
    description:
      "How bring-your-own merch works: what to bring, what we need from you, and how we decorate items sourced outside our online catalogue.",
  }

  return (
    <>
      <div className="content-container py-12 small:py-16 small:pb-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />

        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Bring your own
          </p>
          <h1
            className={`${lora.className} mt-2 text-3xl font-semibold text-[var(--brand-primary)] small:text-4xl`}
          >
            BYO: how it works
          </h1>
          <p className="mt-4 text-base text-ui-fg-subtle small:text-lg">
            Not every job starts from our online store. If you have garments from elsewhere—or a
            specific blank in mind—we can still help with decoration, finishing, and advice.
          </p>
          <a
            href="#byo-inquiry"
            className="mt-5 inline-block text-sm font-semibold text-[var(--brand-secondary)] underline-offset-4 hover:underline"
          >
            Jump to the BYO question form
          </a>
        </header>
      </div>

      <ScrollExpandingSection
        eyebrow="Bring your own"
        title="We decorate what you bring"
        primaryCta={{ href: "#byo-inquiry", label: "Contact us" }}
      />

      <div className="content-container py-6 small:py-8 small:pt-6">
        <div className="mx-auto max-w-3xl space-y-10 text-ui-fg-base">
        <section>
          <h2 className="text-lg font-semibold">What &quot;BYO&quot; means</h2>
          <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
            BYO (bring your own) means you supply the blank apparel or merch, or you source an item
            we don&apos;t list on the site. We review what you bring in, confirm what decoration
            options suit the fabric and use-case, and quote before we go ahead.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">What to bring or send us</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
            <li>Clean garments or blanks in the sizes you need (where possible, extras for testing).</li>
            <li>Any brand or care labels you need to preserve—or notes if tags should be changed.</li>
            <li>Your artwork, or a clear brief for our design team (formats and resolution guidance on request).</li>
            <li>A rough idea of quantity and in-hands date so we can plan production.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">What happens next</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
            <li>We check your items for decoration compatibility (fabric, seams, and placement).</li>
            <li>We send a quote and timeline based on the print or embroidery method you need.</li>
            <li>After approval, we produce a proof or sample where required, then run production.</li>
            <li>We finish, pack, and notify you for pickup or shipping—same as a standard order.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Timelines</h2>
          <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
            Timelines depend on decoration type, art approval, and current workload. We&apos;ll
            always give a realistic window with your quote. Rush jobs may be possible—ask when you
            get in touch.
          </p>
        </section>

        <p className="text-sm text-ui-fg-subtle">
          Prefer the full catalogue?{" "}
          <LocalizedClientLink href="/store" className="font-semibold text-[var(--brand-secondary)] hover:underline">
            Browse the store
          </LocalizedClientLink>{" "}
          or{" "}
          <LocalizedClientLink href="/contact" className="font-semibold text-[var(--brand-secondary)] hover:underline">
            use the main contact form
          </LocalizedClientLink>{" "}
          for anything else.
        </p>
      </div>

      <div className="mx-auto mt-16 max-w-xl scroll-mt-24 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-6 small:p-8">
        <h2 className="text-lg font-semibold text-ui-fg-base" id="byo-inquiry-heading">
          BYO questions
        </h2>
        <p className="mt-1 text-sm text-ui-fg-subtle">
          Tell us the printing type and garment types you have in mind—we&apos;ll get back to you.
        </p>
        <ByoInquiryForm className="mt-6" id="byo-inquiry" />
      </div>
      </div>
    </>
  )
}
