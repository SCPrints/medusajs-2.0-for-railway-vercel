import { Metadata } from "next"

import { getLookbookPage } from "@lib/data/lookbook"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import SphereGalleryClient from "./sphere-gallery-client"
import {
  FALLBACK_PROJECTS,
  SPHERE_TILE_COUNT,
  type SphereProject,
} from "./projects"

// Lives OUTSIDE the (main) route group on purpose — no nav, no footer, no chat
// widget. The gallery ships its own phantom.land-style chrome.

// The store lookbook route clamps `limit` to 48 per page — fetch three pages
// so all SPHERE_TILE_COUNT (122) tiles can carry a unique photo when the
// lookbook has them.
const SPHERE_POOL_PAGE_SIZE = 48
const SPHERE_POOL_PAGES = 3

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
  const pages = await Promise.all(
    Array.from({ length: SPHERE_POOL_PAGES }, (_, i) =>
      getLookbookPage(i + 1, SPHERE_POOL_PAGE_SIZE)
    )
  )
  const items = pages.flatMap((p) => p.items)

  // Staff upload many photos of one job (all sharing a title) but usually link
  // the product to just one of them. Treat the link as job-wide: build
  // title → first linked product handle, so every photo of that job deep-links
  // even if only one was explicitly linked. An explicit per-tile link still
  // wins; this only fills the gaps.
  const handleByTitle = new Map<string, string>()
  for (const item of items) {
    const h = item.products[0]?.handle
    if (!h) continue
    const key = item.title.trim().toLowerCase()
    if (!handleByTitle.has(key)) handleByTitle.set(key, h)
  }

  // No repeats on the ball. Staff upload several photos of the same job
  // back-to-back (adjacent weights), so raw order floods one region of the
  // sphere with one job. Dedupe by image URL, group by job title, then place
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
  const spread = slots.filter(Boolean).slice(0, SPHERE_TILE_COUNT)

  const projects: SphereProject[] = spread.map((item) => ({
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
    <SphereGalleryClient
      projects={projects.length > 0 ? projects : FALLBACK_PROJECTS}
    />
  )
}
