import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCategoryByHandle } from "@lib/data/categories"
import { buildAbsoluteUrl, metaDescription, SEO } from "@lib/util/seo"
import CategoryTemplate from "@modules/categories/templates"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

type Props = {
  params: Promise<{ category: string[]; countryCode: string }>
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
    minPrice?: string
    maxPrice?: string
    inStock?: string
    brand?: string
    fabric?: string
  }>
}

const parsePositiveNumber = (value?: string) => {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return Math.floor(parsed)
}

// No `generateStaticParams` here.
//
// Like `/products/[handle]`, this route previously fanned out one
// `listCategories()` + `listRegions()` call at build time per (country ×
// category) pair. When the backend stalled (Sydney Fly machine + heavy field
// expansion), the build failed at "Collecting page data for /[countryCode]/
// categories/[...category]" — exactly the symptom we saw in the May 2026
// Vercel deploy log.
//
// Cache Components + `getCategoryByHandle` (which is itself cached) handle
// on-demand rendering after first hit, so the route is fully dynamic and
// safe to render at request time.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { category, countryCode } = await params
    const { product_categories } = await getCategoryByHandle(category)

    const leaf = product_categories[product_categories.length - 1]

    // Prefix the audience so sibling sub-categories (mens-polos vs
    // womens-polos) get distinct, keyword-rich titles instead of both
    // collapsing to "Polos". Top-level audience pages have no parent, so
    // they fall back to just the leaf name.
    const parentName = leaf.parent_category?.name
    const label =
      parentName &&
      !leaf.name.toLowerCase().startsWith(parentName.toLowerCase())
        ? `${parentName} ${leaf.name}`
        : leaf.name

    const title = `Custom ${label} — Printing & Embroidery`

    const description = metaDescription(
      leaf.description,
      `Custom ${label} printed & embroidered by SC PRINTS — screen print, DTF and embroidery with bulk pricing and fast Australian turnaround.`
    )

    return {
      title,
      description,
      alternates: {
        canonical: `/${countryCode}/categories/${category.join("/")}`,
      },
      openGraph: {
        url: buildAbsoluteUrl(`/${countryCode}/categories/${category.join("/")}`),
        title: `${title} | ${SEO.siteName}`,
        description,
      },
      twitter: {
        title: `${title} | ${SEO.siteName}`,
        description,
        images: [SEO.ogImage],
      },
    }
  } catch (error) {
    notFound()
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category, countryCode } = await params
  const { sortBy, page, minPrice, maxPrice, inStock, brand, fabric } = await searchParams

  const { product_categories } = await getCategoryByHandle(category)

  if (!product_categories) {
    notFound()
  }

  return (
    <CategoryTemplate
      categories={product_categories}
      sortBy={sortBy}
      page={page}
      minPrice={parsePositiveNumber(minPrice)}
      maxPrice={parsePositiveNumber(maxPrice)}
      inStock={inStock === "1"}
      brand={brand?.trim() || undefined}
      fabric={fabric?.trim() || undefined}
      countryCode={countryCode}
    />
  )
}
