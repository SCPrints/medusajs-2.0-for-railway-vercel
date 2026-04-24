import { Metadata } from "next"

import { getGraphSummary } from "@lib/data/graph"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { ExploreTemplate } from "@modules/graph/templates/explore-template"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/explore`
  const description =
    "Explore our catalog as an interactive graph of brands, categories, and products — discover related items visually."

  return {
    title: "Explore the catalog",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Explore the catalog | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Explore the catalog | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

type PageProps = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const [summary, search] = await Promise.all([
    getGraphSummary(),
    searchParams,
  ])

  const focusRaw = search?.focus
  const focus = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw
  const initialFocus = typeof focus === "string" && focus.length ? focus : null

  return <ExploreTemplate initialPayload={summary} initialFocus={initialFocus} />
}
