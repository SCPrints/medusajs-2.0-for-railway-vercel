import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import SphereGalleryClient from "./sphere-gallery-client"

// Lives OUTSIDE the (main) route group on purpose — no nav, no footer, no chat
// widget. The gallery ships its own phantom.land-style chrome.

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
  const canonicalPath = `/${countryCode}/lookbook-sphere`
  const description =
    "Immersive spherical lookbook — drag to explore real SC Prints jobs on the inside of a sphere."

  return {
    title: "Lookbook Sphere",
    description,
    // Prototype route — keep out of the index until it replaces /lookbook.
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Lookbook Sphere | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function LookbookSpherePage() {
  return <SphereGalleryClient />
}
