import { Metadata } from "next"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import GuideCard from "@modules/guides/components/guide-card"
import { GUIDES, guideHref } from "@modules/guides/guides"

const TITLE = "Guides: Print Methods, Brands & Artwork"
const DESCRIPTION =
  "Plain-English guides to custom printing: how to choose between DTF, screen printing and embroidery, brand guides for AS Colour and Shaka Wear, and artwork tips."

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type Props = { params: Promise<{ countryCode: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/guides`
  const socialTitle = `${TITLE} | ${SEO.siteName}`

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: socialTitle,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
  }
}

export default function GuidesIndexPage() {
  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITLE,
    itemListElement: GUIDES.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: g.title,
      url: buildAbsoluteUrl(`/au${guideHref(g)}`),
    })),
  }

  return (
    <div className="content-container py-14 small:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(listLd) }} />

      <header className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">Guides</p>
        <h1 className="page-title-marketing mt-3">Know before you order</h1>
        <p className="mt-4 max-w-2xl text-ui-fg-subtle">
          Short, plain-English guides to the decisions that come up on every job: which print
          method, which garment, and how to get your artwork right.
        </p>
      </header>

      <ul className="mt-10 grid list-none grid-cols-1 gap-5 p-0 phone:grid-cols-2 small:grid-cols-3">
        {GUIDES.map((guide) => (
          <li key={guide.slug}>
            <GuideCard guide={guide} />
          </li>
        ))}
      </ul>

      <section className="mt-14 rounded-2xl bg-[var(--brand-primary)] p-8 text-center small:p-10">
        <h2 className="text-2xl font-semibold text-white">Still not sure?</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/80">
          Tell us what you are making and we will point you at the right garment and method.
        </p>
        <LocalizedClientLink
          href="/contact"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold !text-white shadow-sm transition hover:brightness-110"
        >
          Ask us about your job
        </LocalizedClientLink>
      </section>
    </div>
  )
}
