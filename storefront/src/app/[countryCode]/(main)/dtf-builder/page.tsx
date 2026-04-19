import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getProductByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { DTF_AUTO_BUILDER_HANDLE } from "@modules/dtf-builder/constants"
import GangsheetBuilder from "@modules/dtf-builder/gangsheet-builder"

type Props = {
  params: { countryCode: string }
  searchParams: { variantId?: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = params
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
  const { countryCode } = params
  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  const product = await getProductByHandle(DTF_AUTO_BUILDER_HANDLE, region.id)

  if (!product?.variants?.length) {
    notFound()
  }

  const requestedVariant =
    product.variants.find((v) => v.id === searchParams.variantId) ?? product.variants[0]

  return (
    <GangsheetBuilder
      product={product}
      countryCode={countryCode}
      initialVariantId={requestedVariant.id}
    />
  )
}
