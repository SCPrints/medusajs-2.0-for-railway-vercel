import { Metadata } from "next"
import { Suspense } from "react"

import { listBrands } from "@lib/data/brands"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { getBrandPresentation, brandInitials } from "@modules/brands/data/brands"
import LocalizedClientLink from "@modules/common/components/localized-client-link"


export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/brands`
  const description =
    "Apparel and headwear brands we print and embroider for — from premium fashion blanks to workwear, healthcare and corporate uniforms."

  return {
    title: "Brands",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Brands | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Brands | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
)

function BrandsPageSkeleton() {
  return (
    <div className="animate-pulse">
      <section className="content-container py-12 small:py-16">
        <div className="mx-auto max-w-3xl text-center space-y-4">
          <div className="h-3 w-20 mx-auto rounded bg-ui-bg-component" />
          <div className="h-9 w-80 mx-auto rounded-lg bg-ui-bg-component" />
          <div className="h-4 w-[28rem] mx-auto rounded bg-ui-bg-component" />
        </div>
      </section>
      <section className="content-container border-t border-ui-border-base py-16 small:py-20">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 small:grid-cols-3 medium:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="h-44 rounded-xl bg-ui-bg-component" />
          ))}
        </ul>
      </section>
    </div>
  )
}

function formatStyleCount(count: number): string | null {
  if (!count || count <= 0) return null
  if (count === 1) return "1 style"
  return `${count.toLocaleString("en-AU")} styles`
}

async function BrandsContent() {
  const brands = await listBrands()
  const brandsById = new Map(brands.map((b) => [b.id, b]))
  const sortedBrands = [...brands].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <section className="content-container py-12 small:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/80">
            Brands
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ui-fg-base small:text-4xl medium:text-5xl">
            The brands we print and embroider for
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-ui-fg-subtle small:text-lg">
            From premium fashion blanks to workwear, healthcare and corporate
            uniforms, we partner with Australia&apos;s leading apparel suppliers
            to deliver custom decoration on the garments your team already
            trusts.
          </p>
        </div>
      </section>

      <section className="content-container border-t border-ui-border-base py-16 small:py-20">
        <ul className="mx-auto grid max-w-6xl list-none grid-cols-2 gap-4 p-0 small:grid-cols-3 medium:grid-cols-4">
          {sortedBrands.map((b) => {
            const presentation = getBrandPresentation(b.handle)
            const logoSrc = b.logo_url ?? presentation.logoSrc ?? null
            const parent = b.parent_id ? brandsById.get(b.parent_id) : null
            const initials = presentation.initials || brandInitials(b.name)
            const styleLabel = formatStyleCount(b.product_count)
            const tagline = b.description?.trim() || null
            return (
              <li key={b.id}>
                <LocalizedClientLink
                  href={`/brands/${b.handle}`}
                  className="group flex h-full flex-col gap-4 rounded-xl border border-ui-border-base bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-sm"
                >
                  <span className="flex h-16 w-full items-center justify-start">
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoSrc}
                        alt=""
                        className="max-h-full max-w-[70%] object-contain object-left [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.08))]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-lg text-xs font-bold uppercase tracking-tight text-white shadow-sm ${presentation.bgClass}`}
                        aria-hidden
                      >
                        {initials}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="text-sm font-semibold text-ui-fg-base transition-colors group-hover:text-[var(--brand-secondary)] small:text-base">
                      {b.name}
                    </span>
                    {parent ? (
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ui-fg-muted">
                        {parent.name} family
                      </span>
                    ) : null}
                    {tagline ? (
                      <span className="line-clamp-2 text-xs text-ui-fg-subtle small:text-sm">
                        {tagline}
                      </span>
                    ) : null}
                  </span>
                  {styleLabel ? (
                    <span className="mt-auto text-xs font-medium text-ui-fg-muted">
                      {styleLabel}
                    </span>
                  ) : null}
                </LocalizedClientLink>
              </li>
            )
          })}
        </ul>

        <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 text-center small:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
            Can&apos;t find your brand?
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-ui-fg-base small:text-3xl">
            We can source garments from most major suppliers.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ui-fg-subtle">
            Tell us the brand and style code &mdash; we&apos;ll come back with
            pricing and availability within one business day.
          </p>
          <div className="mt-7 flex justify-center">
            <LocalizedClientLink
              href="/contact"
              className="group inline-flex items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Request a quote
              <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
            </LocalizedClientLink>
          </div>
        </div>
      </section>
    </>
  )
}

export default function BrandsPage() {
  return (
    <Suspense fallback={<BrandsPageSkeleton />}>
      <BrandsContent />
    </Suspense>
  )
}
