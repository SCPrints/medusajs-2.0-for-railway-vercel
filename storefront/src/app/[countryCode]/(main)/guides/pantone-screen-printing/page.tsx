import { Metadata } from "next"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import PantoneGuide from "@modules/guides/pantone-screen/components/pantone-guide"

const TITLE = "Pantone colours for screen printing"
const DESCRIPTION =
  "How to supply a Pantone reference for screen printing, what changes the match on fabric, and a chart of the base inks and most-requested Pantone solids."

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type Props = { params: Promise<{ countryCode: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/guides/pantone-screen-printing`
  const socialTitle = `${TITLE} | ${SEO.siteName}`

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: socialTitle,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
  }
}

export default function PantoneScreenPrintingGuidePage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${TITLE} | ${SEO.siteName}`,
    description: DESCRIPTION,
    publisher: { "@type": "Organization", name: SEO.siteName },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }} />
      <PantoneGuide />
    </>
  )
}
