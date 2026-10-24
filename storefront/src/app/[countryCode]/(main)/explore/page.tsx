import { Metadata } from "next"
import Link from "next/link"

import { getGraphSummary } from "@lib/data/graph"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { ExploreTemplate } from "@modules/graph/templates/explore-template"

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type Props = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/explore`
  const description =
    "Explore our catalog as a map of brands, categories and products — a space-themed way to discover related items visually."

  return {
    title: "Explore the catalog",
    description,
    alternates: { canonical: canonicalPath },
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

/**
 * No `searchParams` read here on purpose: under Cache Components that single
 * read made the whole page a per-request dynamic render whose body never made
 * it into the CDN document (React #419 on every load). The optional
 * `?focus=<node id>` deep link is read client-side in ExploreTemplate instead,
 * so this page prerenders with the cached summary baked in.
 */
export default async function ExplorePage({ params }: Props) {
  const { countryCode } = await params

  let payload: Awaited<ReturnType<typeof getGraphSummary>>
  try {
    payload = await getGraphSummary()
  } catch (error) {
    return (
      <div className="content-container py-16 flex flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold text-ui-fg-base">Explore the catalog</h1>
        <p className="text-ui-fg-subtle max-w-prose">
          The catalog map can&rsquo;t reach the catalog service right now.
        </p>
        <details className="text-xs text-ui-fg-muted max-w-prose">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="whitespace-pre-wrap mt-2">
            {error instanceof Error ? error.message : "unknown error"}
          </pre>
        </details>
        <Link href={`/${countryCode}/brands`} className="text-ui-fg-interactive hover:underline">
          Browse brands instead
        </Link>
      </div>
    )
  }
  return <ExploreTemplate initialPayload={payload} />
}
