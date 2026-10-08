import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveBrandByHandle } from "@lib/data/brands"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import StoreTemplate from "@modules/store/templates"
import BrandHero from "@modules/brands/components/brand-hero"
import BrandGallery from "@modules/brands/components/brand-gallery"
import { getBrandPresentation } from "@modules/brands/data/brands"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type Params = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{
    page?: string
    minPrice?: string
    maxPrice?: string
    inStock?: string
    fabric?: string
    tagId?: string
    typeId?: string
    sortBy?: string
  }>
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ countryCode: string; handle: string }>
}): Promise<Metadata> {
  const { countryCode, handle } = await params
  const { brand } = await retrieveBrandByHandle(handle)
  if (!brand) {
    return { title: "Brand" }
  }
  const canonicalPath = `/${countryCode}/brands/${handle}`
  const presentation = getBrandPresentation(brand.handle)
  const title = presentation.seoTitle ?? brand.name
  const description =
    presentation.intro ??
    brand.description ??
    `${brand.name} apparel and headwear — explore products available for printing and embroidery.`
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${title} | ${SEO.siteName}`,
      description,
      images: brand.logo_url ? [{ url: brand.logo_url }] : [SEO.ogImage],
    },
    twitter: {
      title: `${title} | ${SEO.siteName}`,
      description,
      images: brand.logo_url ? [brand.logo_url] : [SEO.ogImage],
    },
  }
}

const parsePositiveNumber = (value?: string) => {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

/** Brand handle → its long-form guide, linked under the hero so the guide isn't an orphan. */
const BRAND_GUIDES: Record<string, { href: string; label: string }> = {
  "shaka-wear": {
    href: "/guides/shaka-wear",
    label: "New to Shaka Wear? Read the fit, weight and size guide",
  },
  "as-colour": {
    href: "/guides/as-colour",
    label: "New to AS Colour? Read the guide to the range, weights and names",
  },
}

export default async function BrandLandingPage({ params, searchParams }: Params){const { countryCode, handle } = await params
  const sp = await searchParams
  const { brand, children } = await retrieveBrandByHandle(handle)
  if (!brand) notFound()

  const presentation = getBrandPresentation(brand.handle)
  const logoSrc = brand.logo_url ?? presentation.logoSrc ?? null
  const galleryImages = presentation.gallery ?? []

  return (
    <>
      <BrandHero
        name={brand.name}
        description={brand.description}
        logoSrc={logoSrc}
        bannerSrc={presentation.bannerSrc ?? null}
        videoSrc={presentation.videoSrc ?? null}
        videoPosterSrc={presentation.videoPosterSrc ?? null}
        bgClass={presentation.bgClass}
        childBrands={children}
        heroVariant={presentation.heroVariant ?? null}
        heroProductSrc={presentation.heroProductSrc ?? null}
      />

      {presentation.intro ? (
        <div className="content-container pt-8">
          <p className="max-w-3xl text-base text-ui-fg-subtle small:text-lg">
            {presentation.intro}
          </p>
        </div>
      ) : null}

      {BRAND_GUIDES[brand.handle] ? (
        <div className="content-container pt-6">
          <LocalizedClientLink
            href={BRAND_GUIDES[brand.handle].href}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold !text-ui-fg-base underline underline-offset-4 hover:!text-[var(--brand-secondary)]"
          >
            {BRAND_GUIDES[brand.handle].label} →
          </LocalizedClientLink>
        </div>
      ) : null}

      {galleryImages.length > 0 ? (
        <BrandGallery brandName={brand.name} images={galleryImages} />
      ) : null}

      <StoreTemplate
        sortBy={(sp.sortBy as any) || "created_at"}
        page={sp.page}
        minPrice={parsePositiveNumber(sp.minPrice)}
        maxPrice={parsePositiveNumber(sp.maxPrice)}
        inStock={sp.inStock === "1"}
        brand={brand.handle}
        fabric={sp.fabric?.trim() || undefined}
        typeId={sp.typeId?.trim() || undefined}
        tagId={sp.tagId?.trim() || undefined}
        countryCode={countryCode}
        heading={{ eyebrow: "Shop the range", title: `All ${brand.name} products` }}
        showHeaderDescription={false}
        titleTag="h2"
        /* Pass the already-resolved brand so StoreTemplate skips the duplicate
         * `retrieveBrandByHandle` fetch (the brand page already called it
         * above in line 60). One less cache lookup roundtrip per render. */
        preResolvedBrand={{
          handle: brand.handle,
          description: brand.description ?? null,
        }}
      />
    </>
  )
}
