import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"

type PolicyMetadataArgs = {
  params: Promise<{ countryCode: string }>
  pathSegment: string
  title: string
  description: string
}

export async function buildPolicyMetadata({
  params,
  pathSegment,
  title,
  description,
}: PolicyMetadataArgs): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/${pathSegment}`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${title} | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `${title} | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}
