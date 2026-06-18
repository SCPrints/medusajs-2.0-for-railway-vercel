import { Metadata } from "next"
import { Suspense } from "react"

import {
  getInstagramFeedMedia,
  getInstagramHandleDisplay,
  getInstagramProfileUrl,
} from "@lib/data/instagram"
import {
  getHomeFeaturedRangeProducts,
  getProductsById,
} from "@lib/data/products"
import {
  getHomeSections,
  hydrateHomeSections,
  type HydratedHomeSection,
} from "@lib/data/home-sections"
import { getRegion } from "@lib/data/regions"
import { getLookbookHomeRail } from "@lib/data/lookbook"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HomeHero from "@modules/home/components/home-hero"
import HomeTurnaroundBanner from "@modules/home/components/home-turnaround-banner"
import HomeCoreServicesLordicons from "@modules/home/components/home-core-services-lordicons"
import HomeTrustStrip from "@modules/home/components/home-trust-strip"
import HomeToolsRail from "@modules/home/components/home-tools-rail"
import HomeLookbookRail from "@modules/home/components/home-lookbook-rail"
import HomeIndustryGrid from "@modules/home/components/home-industry-grid"
import HomeGuaranteeBlock from "@modules/home/components/home-guarantee-block"
import HowOrderWorksSection from "@modules/home/components/how-order-works-section"
import FeaturedProductsCarousel from "@modules/home/components/featured-products-carousel"
import InstagramFeedStrip from "@modules/home/components/instagram-feed-strip"
import ScrollingPictureBar from "@modules/home/components/scrolling-picture-bar"
import SectionHeader from "@modules/common/components/section-header"
import ProductListingCard from "@modules/products/components/product-listing-card"
import { buildProductListingCardData } from "@modules/products/lib/product-listing-card-data"
import BundleCard from "@modules/bundles/components/bundle-card"


export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

// NOTE: Cache Components is enabled, so this route's uncached data fetches
// (incl. the rotating lookbook rail) run per render — no `revalidate`/route
// cache freezes the random selection. (`export const revalidate` is also
// incompatible with cacheComponents and breaks the build.)

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}`
  const description = SEO.siteDescription

  return {
    title: "Custom Apparel & Branded Merch",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${SEO.siteName} | Custom Apparel & Branded Merch`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${SEO.siteName} | Custom Apparel & Branded Merch`,
      description,
      images: [SEO.ogImage],
    },
  }
}

type StatIconProps = { className?: string }

const ExperienceIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <circle cx="12" cy="8" r="6" />
    <path d="M8.5 13L7 22l5-3 5 3-1.5-9" />
  </svg>
)

const LocationIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M12 22s-7-6.5-7-12a7 7 0 1114 0c0 5.5-7 12-7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

const StackIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M3 7l9-4 9 4-9 4-9-4z" />
    <path d="M3 12l9 4 9-4" />
    <path d="M3 17l9 4 9-4" />
  </svg>
)

const TruckIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <rect x="2" y="7" width="11" height="10" rx="1" />
    <path d="M13 10h4l4 4v3h-8" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </svg>
)

const WHY_STATS = [
  { value: "10+ yrs", label: "Printing experience", Icon: ExperienceIcon },
  { value: "NSW, AU", label: "Local studio", Icon: LocationIcon },
  { value: "Aus-wide", label: "Shipping", Icon: TruckIcon },
  { value: "From 1", label: "Garment minimum", Icon: StackIcon },
]

// ————————————————————————————————————————————————————————————————————————
// Streaming architecture: the page component itself awaits NOTHING but the
// route params, so the hero + every zero-data section prerenders into the
// static shell (PPR) and paints immediately — the LCP element no longer
// waits for the slowest backend fetch. Each data-dependent section below is
// its own async server component inside a <Suspense> whose fallback reserves
// the section's real height (no skeleton→content reflow when it streams in).
// ————————————————————————————————————————————————————————————————————————

/**
 * Home product rails — staff-curated in admin (/app/home-sections). Each
 * published section is a hand-picked, ordered list of products, rendered
 * top-to-bottom in weight order. Products are referenced by handle so
 * curation survives supplier re-imports. If no sections are curated yet,
 * we fall back to the legacy "popular hoodies" logic so the page is never
 * empty mid-rollout. Each rail's "View all products" deep-links to the
 * section's own /collections/<handle> full grid (see that route).
 */
async function HomeFeaturedSections({ countryCode }: { countryCode: string }) {
  const region = await getRegion(countryCode)
  if (!region) {
    return null
  }

  const curatedSections = await getHomeSections()
  // Shared hydrator (also used by /collections/[handle]) so a section shows
  // the same items on the rail and on its full-grid page.
  let featuredSections: HydratedHomeSection[] = await hydrateHomeSections(
    curatedSections,
    region.id
  )

  if (featuredSections.length === 0) {
    const products = await getHomeFeaturedRangeProducts({
      countryCode,
      limit: 12,
    })
    const productIds = (products ?? [])
      .map((product) => product.id)
      .filter(Boolean) as string[]
    const pricedProducts = productIds.length
      ? await getProductsById({ ids: productIds, regionId: region.id })
      : []
    const pricedMap = new Map(
      pricedProducts.map((product) => [product.id, product])
    )
    featuredSections = [
      {
        id: "featured-fallback",
        // No curated section behind the fallback rail → "View all" goes to the
        // full catalogue rather than a (nonexistent) /collections page.
        handle: null,
        title: "Popular garments to start your order",
        subtitle: "Featured range",
        items: (products ?? []).map((p) => ({
          kind: "product" as const,
          product: (p.id ? pricedMap.get(p.id) : undefined) ?? p,
        })),
      },
    ]
  }

  return (
    <>
      {featuredSections.map((section, sectionIndex) => (
        <section key={section.id} className="content-container py-12">
          <FeaturedProductsCarousel
            title={section.title}
            subtitle={section.subtitle}
            // Every curated rail links to its own full grid; the legacy
            // fallback rail (no handle) links to the whole catalogue.
            viewAllHref={
              section.handle ? `/collections/${section.handle}` : "/store"
            }
          >
            {section.items.map((item, itemIndex) => {
              if (item.kind === "bundle") {
                return (
                  <li
                    key={item.bundle.id}
                    className="w-[280px] shrink-0 snap-start"
                  >
                    <BundleCard bundle={item.bundle} />
                  </li>
                )
              }
              const product = item.product
              const { cheapestPrice } = getProductPrice({ product })
              const data = buildProductListingCardData(product, cheapestPrice)
              return (
                <li
                  key={product.id}
                  className="w-[280px] shrink-0 snap-start"
                >
                  <ProductListingCard
                    {...data}
                    // First visible cards of the FIRST rail can be the LCP
                    // element on viewports where the hero is short — fetch
                    // them eagerly; everything else stays lazy.
                    imagePriority={sectionIndex === 0 && itemIndex < 3}
                  />
                </li>
              )
            })}
          </FeaturedProductsCarousel>
        </section>
      ))}
    </>
  )
}

/** Height-true fallback for one featured rail (header row + 280px cards). */
function FeaturedRailFallback() {
  return (
    <section className="content-container py-12" aria-hidden>
      <div className="animate-pulse">
        <div className="h-3 w-32 rounded bg-ui-bg-subtle" />
        <div className="mt-3 h-7 w-72 rounded bg-ui-bg-subtle" />
        <ul className="mt-6 flex list-none gap-4 overflow-hidden p-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="w-[280px] shrink-0">
              <div className="rounded-xl border border-ui-border-base bg-white p-4">
                <div className="aspect-[1/1] w-full rounded-lg bg-ui-bg-subtle" />
                <div className="mt-4 h-5 w-3/4 rounded bg-ui-bg-subtle" />
                <div className="mt-2 h-4 w-1/2 rounded bg-ui-bg-subtle" />
                <div className="mt-4 h-3 w-24 rounded bg-ui-bg-subtle" />
                <div className="mt-2 flex gap-2">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <span
                      key={j}
                      className="h-5 w-5 rounded-full bg-ui-bg-subtle"
                    />
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** "Our recent work" — streams independently; rotates over the cached pool. */
async function HomeLookbookSection() {
  const lookbookItems = await getLookbookHomeRail(8)
  return <HomeLookbookRail items={lookbookItems} />
}

/** Height-true fallback mirroring HomeLookbookRail's section + 4/5 tiles. */
function LookbookRailFallback() {
  return (
    <section
      className="border-t border-ui-border-base bg-ui-bg-subtle py-12 small:py-16"
      aria-hidden
    >
      <div className="content-container animate-pulse">
        <div className="h-3 w-36 rounded bg-ui-bg-base" />
        <div className="mt-3 h-7 w-64 rounded bg-ui-bg-base" />
        <ul className="mt-2 grid list-none grid-cols-2 gap-3 p-0 phone:gap-4 tablet:grid-cols-3 small:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i}>
              <div className="overflow-hidden rounded-lg border border-ui-border-base bg-white">
                <div className="aspect-[4/5] bg-ui-bg-base" />
                <div className="p-3">
                  <div className="h-4 w-2/3 rounded bg-ui-bg-base" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Instagram strip — bottom of page; streams in behind everything else. */
async function HomeInstagramSection() {
  const instagramMedia = await getInstagramFeedMedia()
  return (
    <InstagramFeedStrip
      items={instagramMedia}
      profileUrl={getInstagramProfileUrl()}
      handleDisplay={getInstagramHandleDisplay()}
    />
  )
}

export default async function Home({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params

  const homepagePath = `/${countryCode}`
  const homeStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SEO.siteName,
    url: buildAbsoluteUrl(homepagePath),
    potentialAction: {
      "@type": "SearchAction",
      target: `${buildAbsoluteUrl(
        `/${countryCode}/search`
      )}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  }

  return (
    <div className="bg-ui-bg-base">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(homeStructuredData),
          }}
        />

        {/* 1. Hero — benefit headline + single CTA (Shop the range → /store) +
            value-prop badges. The first real H1 in the home body. Image-free
            shell for now; a background image/canvas can be dropped in behind the
            content later (see home-hero.tsx). */}
        <HomeHero />

        {/* 2. Turnaround line — static promise copy (the eta prop is unused
            by the component, so the page no longer fetches the ETA at all). */}
        <HomeTurnaroundBanner eta={null} />

        {/* 3. Trust strip — now reinforces below the hero rather than leading.
            Six signals: heritage, shipping, no minimum, live order tracking,
            free DPI check, in-house proofs. The last three are unique to SC
            Prints and not visible anywhere else on the site pre-purchase. */}
        <HomeTrustStrip />

        {/* Featured products — staff-curated sections (see /app/home-sections),
            rendered top-to-bottom in weight order. Falls back to popular hoodies
            when no sections are curated. Streams independently behind a
            height-true fallback so the shell paints without waiting for it. */}
        <Suspense fallback={<FeaturedRailFallback />}>
          <HomeFeaturedSections countryCode={countryCode} />
        </Suspense>

        {/* Tools rail — surfaces the built-but-buried Design Studio, DTF
            builder, BYO and Bundles, which had no home entry point before. */}
        <HomeToolsRail />

        {/* Our recent work — Lookbook social proof. Self-hides when no tiles
            are published. */}
        <Suspense fallback={<LookbookRailFallback />}>
          <HomeLookbookSection />
        </Suspense>

        {/* Shop by industry — routes segmented B2B buyers to the existing
            /industries landing pages. */}
        <HomeIndustryGrid />

        {/* 4. Brand carousel — contextualises the products above */}
        <ScrollingPictureBar />

        {/* 5. Services — shown while customer is in discovery mode */}
        <section className="content-container py-14">
          <SectionHeader
            eyebrow="Decoration & finishing"
            title="Services we offer on your order"
          />
          <HomeCoreServicesLordicons />
        </section>

        {/* 6. How to order — once the customer has seen what's available */}
        <HowOrderWorksSection />

        {/* Risk-reversal — reframes our real proof/DPI/local/pricing
            capabilities as promises right before the closing CTA. */}
        <HomeGuaranteeBlock />

        {/* 7. Why SC Prints + single closing CTA */}
        <section className="content-container py-16">
          <SectionHeader
            eyebrow="Why SC Prints"
            title="Built for teams that need it right."
            align="center"
          />

          <ul className="mt-8 grid list-none grid-cols-2 gap-3 p-0 phone:gap-4 tablet:grid-cols-4 small:grid-cols-4">
            {WHY_STATS.map((stat) => {
              const { Icon } = stat
              return (
                <li
                  key={stat.label}
                  className="group flex flex-col items-center rounded-lg border border-ui-border-base bg-white p-6 text-center transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-sm"
                >
                  <Icon className="text-[var(--brand-secondary)]/70 transition-colors group-hover:text-[var(--brand-secondary)]" />
                  <p className="mt-3 text-2xl font-semibold text-ui-fg-base small:text-3xl">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-subtle">
                    {stat.label}
                  </p>
                </li>
              )
            })}
          </ul>

          <div className="mt-10 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 text-center small:p-10">
            <h3 className="text-2xl font-semibold text-ui-fg-base small:text-3xl">
              Talk to our team about your run.
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-ui-fg-subtle">
              Pricing, garment selection, artwork &mdash; we&apos;ll come back
              within one business day.
            </p>
            <div className="mt-7 flex justify-center">
              {/* Assisted-help path for larger team/club/corporate runs →
                  /contact. Not a quote flow: SC Prints sells direct off the
                  catalogue, so this is "talk to us", not "get a quote". */}
              <LocalizedClientLink
                href="/contact"
                className="group inline-flex min-h-12 items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Get in touch
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                >
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </LocalizedClientLink>
            </div>
          </div>
        </section>

        {/* 8. Instagram — social proof near the bottom-of-funnel moment.
            Last section above the footer; null fallback is fine (any shift on
            stream-in only moves the footer, and only on slow connections). */}
        <Suspense fallback={null}>
          <HomeInstagramSection />
        </Suspense>
      </div>
  )
}
