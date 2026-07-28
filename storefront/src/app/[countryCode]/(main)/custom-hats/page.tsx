import { Metadata } from "next"
import { Lora } from "next/font/google"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import SectionHeader from "@modules/common/components/section-header"
import { METHOD_GROUPS } from "@modules/custom-hats/data"
import HatBriefBuilder from "@modules/custom-hats/components/hat-brief-builder"

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

const lora = Lora({ subsets: ["latin"], display: "swap", weight: ["500", "600", "700"] })

const DESCRIPTION =
  "Fully custom caps and hats: embroidery (flat, 3D puff, chenille, appliqué), applied patches, heat-applied prints, direct print, and structural trim. Build a brief and we'll quote it."

export async function generateMetadata({
  params,
}: {
  params: Promise<{ countryCode: string }>
}): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/custom-hats`
  return {
    title: "Custom Hats & Caps",
    description: DESCRIPTION,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Custom Hats & Caps | ${SEO.siteName}`,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Custom Hats & Caps | ${SEO.siteName}`,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
  }
}

const STEPS = [
  { n: "01", t: "Build your brief", d: "Pick a cap, add each logo with its location and decoration method, and drop in artwork." },
  { n: "02", t: "We quote it", d: "We review the brief, confirm what suits the cap, and send a price and timeline." },
  { n: "03", t: "Approve a proof", d: "You approve a digital proof (or physical sample where needed) before we run production." },
  { n: "04", t: "We make it", d: "Decorated, finished, and packed — ready for pickup or shipping." },
]

export default async function CustomHatsPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const pagePath = `/${countryCode}/custom-hats`
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Custom Hats & Caps",
    serviceType: "Custom headwear decoration",
    provider: { "@type": "Organization", name: SEO.siteName },
    url: buildAbsoluteUrl(pagePath),
    description: DESCRIPTION,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      {/* Hero */}
      <section className="content-container py-14 small:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/70">
            Fully custom headwear
          </p>
          <h1 className={`${lora.className} mt-3 text-4xl font-semibold leading-tight text-[var(--brand-primary)] small:text-5xl`}>
            Custom hats & caps
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-ui-fg-subtle small:text-lg">
            Every element, your way — cap style and colours, embroidery, patches, heat-applied
            prints, direct print, and structural trim. Build a brief below and we&apos;ll quote it.
          </p>
          <div className="mt-7">
            <a
              href="#hat-brief"
              className="group inline-flex items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Start your hat
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </a>
          </div>
        </header>
      </section>

      {/* What's possible */}
      <section className="border-t border-ui-border-base bg-ui-bg-subtle py-12 small:py-16" aria-labelledby="hat-methods-heading">
        <div className="content-container">
          <SectionHeader eyebrow="Decoration options" title="What's possible" id="hat-methods-heading" />
          <div className="mt-8 grid grid-cols-1 gap-4 tablet:grid-cols-2">
            {METHOD_GROUPS.map((g) => (
              <div key={g.group} className="rounded-2xl border border-ui-border-base bg-white p-6">
                <h3 className="text-base font-semibold text-ui-fg-base">{g.group}</h3>
                <p className="mt-1 text-xs text-ui-fg-subtle">{g.blurb}</p>
                <ul className="mt-4 space-y-2">
                  {g.methods.map((m) => (
                    <li key={m.id} className="text-sm text-ui-fg-base">
                      <span className="font-medium">{m.label}</span>
                      {m.blurb ? <span className="text-ui-fg-subtle"> — {m.blurb}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-ui-fg-subtle">
            Plus structural trim: deboss, laser etch, woven labels, metal badges, contrast stitching,
            custom eyelets and closures.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="content-container py-12 small:py-16" aria-labelledby="hat-process-heading">
        <SectionHeader eyebrow="Process" title="How it works" id="hat-process-heading" />
        <ol className="mt-8 grid list-none grid-cols-1 gap-px overflow-hidden rounded-lg border border-ui-border-base bg-ui-border-base phone:grid-cols-2 large:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="group relative overflow-hidden bg-white p-5 phone:p-6">
              <span aria-hidden className="pointer-events-none absolute -right-1 -top-3 select-none text-[5rem] font-semibold leading-none tracking-tighter text-[var(--brand-secondary)]/10">
                {s.n}
              </span>
              <p className="relative mt-8 text-sm font-semibold uppercase tracking-wide text-ui-fg-base">{s.t}</p>
              <p className="relative mt-2 text-xs text-ui-fg-subtle">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Brief builder */}
      <section className="border-t border-ui-border-base bg-ui-bg-subtle py-12 small:py-16" aria-labelledby="hat-brief-heading">
        <div className="content-container">
          <SectionHeader eyebrow="Build your brief" title="Design your hat" id="hat-brief-heading" align="center" />
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-ui-border-base bg-white p-6 small:p-8">
            <HatBriefBuilder id="hat-brief" />
          </div>
        </div>
      </section>
    </>
  )
}
