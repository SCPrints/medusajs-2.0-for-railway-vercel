import { Metadata } from "next"

import { getProductByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { DTF_AUTO_BUILDER_HANDLE } from "@modules/dtf-builder/constants"
import { DtfBuilderInvalidRegion, DtfBuilderMissingProduct } from "@modules/dtf-builder/dtf-builder-states"
import GangsheetBuilder from "@modules/dtf-builder/gangsheet-builder"

/** Avoid Data Cache serving a long-lived “product missing” after you add/seed `dtf-auto-builder`. */
export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ variantId?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/dtf-builder`
  const description =
    "Upload transparent PNGs, arrange them on your DTF roll size, and download a print-ready gang sheet."

  return {
    title: "DTF gang sheet builder",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `DTF gang sheet builder | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `DTF gang sheet builder | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function DtfBuilderPage({ params, searchParams }: Props) {
  const { countryCode } = await params
  const { variantId: variantIdParam } = await searchParams
  const region = await getRegion(countryCode)

  if (!region) {
    return <DtfBuilderInvalidRegion countryCode={countryCode} />
  }

  const product = await getProductByHandle(DTF_AUTO_BUILDER_HANDLE, region.id)

  if (!product?.variants?.length) {
    return <DtfBuilderMissingProduct countryCode={countryCode} />
  }

  const requestedVariant =
    product.variants.find((v) => v.id === variantIdParam) ?? product.variants[0]

  return (
    <GangsheetBuilder
      product={product}
      countryCode={countryCode}
      initialVariantId={requestedVariant.id}
    />
  )
}
