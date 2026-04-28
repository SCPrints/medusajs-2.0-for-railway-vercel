import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import CmykDtfGuide from "@modules/guides/cmyk-dtf/components/cmyk-dtf-guide"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/guides/cmyk-dtf`
  const description =
    "CMYK reference values and tips for preparing artwork for DTF (direct-to-film) transfers. Understand ink mixes, limits, and why proofs beat screen previews."

  return {
    title: "CMYK guide for DTF printing",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `CMYK guide for DTF printing | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `CMYK guide for DTF printing | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function CmykDtfGuidePage() {
  const techArticleStructuredData = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `CMYK guide for DTF printing | ${SEO.siteName}`,
    description:
      "Reference CMYK mixes and practical guidance for preparing designs for direct-to-film printing.",
    publisher: {
      "@type": "Organization",
      name: SEO.siteName,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleStructuredData) }}
      />
      <CmykDtfGuide />
    </>
  )
}
