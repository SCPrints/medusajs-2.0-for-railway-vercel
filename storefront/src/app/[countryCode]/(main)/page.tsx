import { Metadata } from "next"
import { HttpTypes } from "@medusajs/types"

import {
  getInstagramFeedMedia,
  getInstagramHandleDisplay,
  getInstagramProfileUrl,
} from "@lib/data/instagram"
import {
  getHomeFeaturedRangeProducts,
  getProductsByHandle,
  getProductsById,
} from "@lib/data/products"
import { getHomeSections } from "@lib/data/home-sections"
import { listBundles, type Bundle } from "@lib/data/bundles"
import { getRegion } from "@lib/data/regions"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HomeCoreServicesLordicons from "@modules/home/components/home-core-services-lordicons"
import HomeTrustStrip from "@modules/home/components/home-trust-strip"
import HowOrderWorksSection from "@modules/home/components/how-order-works-section"
import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import { NEWMIX_V3_TUNING } from "@modules/home/components/home-particle-logo-hero/newmix-v3-preset"
import { WORDMARK_GRADIENT } from "@modules/common/lib/wordmark-gradient"
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

export default async function Home({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  // Home product rails are staff-curated in admin (/app/home-sections). Each
  // published section is a hand-picked, ordered list of products, rendered
  // top-to-bottom in weight order. Products are referenced by handle so
  // curation survives supplier re-imports. If no sections are curated yet,
  // we fall back to the legacy "popular hoodies" logic so the page is never
  // empty mid-rollout.
  // A curated section entry is either a product or a bundle. Bundles are
  // referenced in the curated handle list with a `bundle:` prefix.
  const BUNDLE_PREFIX = "bundle:"
  type FeaturedItem =
    | { kind: "product"; product: HttpTypes.StoreProduct }
    | { kind: "bundle"; bundle: Bundle }
  type FeaturedSection = {
    id: string
    title: string
    subtitle: string | null
    items: FeaturedItem[]
  }

  const curatedSections = await getHomeSections()
  let featuredSections: FeaturedSection[] = []

  if (curatedSections.length > 0) {
    const allHandles = Array.from(
      new Set(curatedSections.flatMap((s) => s.product_handles))
    )
    const productHandles = allHandles.filter(
      (h) => !h.startsWith(BUNDLE_PREFIX)
    )
    const hasBundles = allHandles.some((h) => h.startsWith(BUNDLE_PREFIX))

    const pricedProducts = productHandles.length
      ? await getProductsByHandle({
          handles: productHandles,
          regionId: region.id,
        })
      : []
    const byHandle = new Map(
      pricedProducts
        .filter((p) => p.handle)
        .map((p) => [p.handle as string, p])
    )

    // Bundles carry no region pricing on the card (item count only), so one
    // unscoped listBundles() call hydrates every curated bundle.
    const bundlesByHandle = new Map<string, Bundle>()
    if (hasBundles) {
      const allBundles = await listBundles()
      for (const b of allBundles) bundlesByHandle.set(b.handle, b)
    }

    featuredSections = curatedSections
      .map((s) => ({
        id: s.id,
        title: s.title,
        subtitle: s.subtitle,
        // preserve the staff-curated order; skip handles that no longer resolve
        items: s.product_handles
          .map((h): FeaturedItem | null => {
            if (h.startsWith(BUNDLE_PREFIX)) {
              const bundle = bundlesByHandle.get(h.slice(BUNDLE_PREFIX.length))
              return bundle ? { kind: "bundle", bundle } : null
            }
            const product = byHandle.get(h)
            return product ? { kind: "product", product } : null
          })
          .filter((i): i is FeaturedItem => Boolean(i)),
      }))
      .filter((s) => s.items.length > 0)
  }

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
        title: "Popular garments to start your order",
        subtitle: "Featured range",
        items: (products ?? []).map((p) => ({
          kind: "product" as const,
          product: (p.id ? pricedMap.get(p.id) : undefined) ?? p,
        })),
      },
    ]
  }

  const instagramMedia = await getInstagramFeedMedia()
  const instagramProfileUrl = getInstagramProfileUrl()
  const instagramHandle = getInstagramHandleDisplay()

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

        {/* 1. Hero — interactive "Newmix v3" particle-logo wordmark (the SC Prints
            wordmark rendered as a cursor-reactive fluid-sim stipple). The shared
            NEWMIX_V3_TUNING preset is also used by the /[countryCode]/old-hero
            reference page so the two never drift. The previous neon digital-rain
            hero (DigitalRainHero + HeroOverlay) and the pixel space scene
            (/space-hero) can be swapped back by re-importing them here. */}
        <HomeParticleLogoHero
          interactionMode="newmix"
          animatedParticleCap={55000}
          newmixLiveTuning={NEWMIX_V3_TUNING}
          bgClassName="bg-ui-fg-base"
          wordmarkGradient={WORDMARK_GRADIENT}
          sectionAriaLabel="SC Prints — custom print apparel"
        />

        {/* 2. Trust strip — immediately under hero. Six signals: heritage,
            shipping, no minimum, live order tracking, free DPI check, in-house
            proofs. Each icon has its own subtle animation (see
            [home-trust-strip.tsx]). The last three signals are unique to SC
            Prints and not visible anywhere else on the site pre-purchase. */}
        <HomeTrustStrip />

        {/* 3. Featured products — staff-curated sections (see /app/home-sections),
            rendered top-to-bottom in weight order. Falls back to popular hoodies
            when no sections are curated. On screen within 2–3 scrolls. */}
        {featuredSections.map((section, sectionIndex) => (
          <section key={section.id} className="content-container py-12">
            <FeaturedProductsCarousel
              title={section.title}
              subtitle={section.subtitle}
              viewAllHref={sectionIndex === 0 ? "/store" : undefined}
            >
              {section.items.map((item) => {
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
                    <ProductListingCard {...data} />
                  </li>
                )
              })}
            </FeaturedProductsCarousel>
          </section>
        ))}

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
              <LocalizedClientLink
                href="/contact"
                className="group inline-flex items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Start a quote
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

        {/* 8. Instagram — social proof near the bottom-of-funnel moment */}
        <InstagramFeedStrip
          items={instagramMedia}
          profileUrl={instagramProfileUrl}
          handleDisplay={instagramHandle}
        />
      </div>
  )
}
