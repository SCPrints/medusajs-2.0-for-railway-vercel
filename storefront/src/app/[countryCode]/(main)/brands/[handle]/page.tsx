import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveBrandByHandle } from "@lib/data/brands"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import StoreTemplate from "@modules/store/templates"
import BrandHero from "@modules/brands/components/brand-hero"
import BrandGallery from "@modules/brands/components/brand-gallery"
import { getBrandPresentation } from "@modules/brands/data/brands"

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
  const description =
    brand.description ??
    `${brand.name} apparel and headwear — explore products available for printing and embroidery.`
  return {
    title: brand.name,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${brand.name} | ${SEO.siteName}`,
      description,
      images: brand.logo_url ? [{ url: brand.logo_url }] : [SEO.ogImage],
    },
  }
}

const parsePositiveNumber = (value?: string) => {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
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
        bgClass={presentation.bgClass}
        childBrands={children}
      />

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
      />
    </>
  )
}
