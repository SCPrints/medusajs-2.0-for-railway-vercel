import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"

import DmcSplash from "./dmc-splash"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/dmc`
  const description = "DMC splash animation."

  return {
    title: "DMC",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `DMC | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function DmcPage() {
  return <DmcSplash />
}
