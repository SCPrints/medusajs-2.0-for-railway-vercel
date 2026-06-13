import { Metadata } from "next"

import { getLookbookPage } from "@lib/data/lookbook"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import CubeGalleryClient from "./cube-gallery-client"
import {
  FALLBACK_PROJECTS,
  CUBE_TILE_COUNT,
  type CubeProject,
} from "./projects"

// Lives OUTSIDE the (main) route group on purpose — no nav, no footer, no chat
// widget. The gallery ships its own phantom.land-style chrome.

// The store lookbook route clamps `limit` to 48 per page — fetch four pages
// so all CUBE_TILE_COUNT (150) tiles can carry a unique photo when the
// lookbook has them.
const CUBE_POOL_PAGE_SIZE = 48
const CUBE_POOL_PAGES = 4

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
  const canonicalPath = `/${countryCode}/lookbook-cube`
  const description =
    "Immersive cubic lookbook — drag to explore real SC Prints jobs on the inside of a cube."

  return {
    title: "Lookbook Cube",
    description,
    // Prototype route — keep out of the index until it replaces /lookbook.
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Lookbook Cube | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function LookbookCubePage() {
  const pages = await Promise.all(
    Array.from({ length: CUBE_POOL_PAGES }, (_, i) =>
      getLookbookPage(i + 1, CUBE_POOL_PAGE_SIZE)
    )
  )
  const items = pages.flatMap((p) => p.items)

  // Treat a product link as job-wide: staff link the product to one photo of a
  // job (shared title) but expect every photo of that job to deep-link. An
  // explicit per-tile link still wins; this only fills the gaps.
  const handleByTitle = new Map<string, string>()
  for (const item of items) {
    const h = item.products[0]?.handle
    if (!h) continue
    const key = item.title.trim().toLowerCase()
    if (!handleByTitle.has(key)) handleByTitle.set(key, h)
  }

  // No repeats on the cube. Staff upload several photos of the same job
  // back-to-back (adjacent weights), so raw order floods one face of the
  // cube with one job. Dedupe by image URL, group by job title, then place
  // each group's photos at evenly spaced positions across the whole list
  // (largest groups first, linear-probing past taken slots) — a job with N
  // photos ends up ~poolSize/N tiles apart instead of clustered.
  const seenUrls = new Set<string>()
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    if (!item.image_url || seenUrls.has(item.image_url)) continue
    seenUrls.add(item.image_url)
    const key = item.title.trim().toLowerCase()
    const group = groups.get(key)
    if (group) {
      group.push(item)
    } else {
      groups.set(key, [item])
    }
  }
  const total = seenUrls.size
  const slots: (typeof items)[number][] = new Array(total)
  const groupsBySize = Array.from(groups.values()).sort(
    (a, b) => b.length - a.length
  )
  for (const group of groupsBySize) {
    group.forEach((item, i) => {
      let pos = Math.floor(((i + 0.5) * total) / group.length) % total
      while (slots[pos]) pos = (pos + 1) % total
      slots[pos] = item
    })
  }
  // Cap at the tile count — anything beyond it would never render but would
  // still cost two canvas textures per entry client-side.
  const spread = slots.filter(Boolean).slice(0, CUBE_TILE_COUNT)

  const projects: CubeProject[] = spread.map((item) => ({
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
    productHandle:
      item.products[0]?.handle ??
      handleByTitle.get(item.title.trim().toLowerCase()) ??
      null,
  }))

  return (
    <CubeGalleryClient
      projects={projects.length > 0 ? projects : FALLBACK_PROJECTS}
    />
  )
}
