import { Metadata } from "next"

import { getLookbookPage } from "@lib/data/lookbook"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import SphereGalleryClient from "./sphere-gallery-client"
import { FALLBACK_PROJECTS, type SphereProject } from "./projects"

// Lives OUTSIDE the (main) route group on purpose — no nav, no footer, no chat
// widget. The gallery ships its own phantom.land-style chrome.

// Enough to give all ~78 sphere tiles a unique photo when the lookbook has them.
const SPHERE_POOL_SIZE = 96

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

export default async function LookbookSpherePage() {
  const { items } = await getLookbookPage(1, SPHERE_POOL_SIZE)

  const projects: SphereProject[] = items
    .filter((item) => item.image_url)
    .map((item) => ({
      id: item.id,
      brand: item.title,
      title: item.attribution ? `Photo · ${item.attribution}` : "SC Prints",
      category: item.tags[0] ?? "",
      tags: item.tags.slice(1, 3),
      year: "",
      image: item.image_url,
      blurb:
        item.description ??
        "One of ours — designed, printed and pressed in-house at the SC Prints studio.",
    }))

  return (
    <SphereGalleryClient
      projects={projects.length > 0 ? projects : FALLBACK_PROJECTS}
    />
  )
}
