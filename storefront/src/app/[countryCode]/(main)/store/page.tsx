import { Metadata } from "next"

import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"


export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

/**
 * Deliberately does NOT read `searchParams`. Touching it makes the whole
 * metadata dynamic, which under PPR keeps <title> and <link rel="canonical">
 * out of the prerendered <head> entirely — they only arrive in the streamed
 * body, where a canonical is unreliable. Params-only keeps the head static.
 *
 * Cost: `/store?brand=Foo` no longer gets a brand-specific tab title. That URL
 * canonicalises to the bare /store anyway, and brand landing copy lives at
 * `/brands/[handle]`, so the title never reached a search result.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ countryCode: string }>
}): Promise<Metadata> {
  const { countryCode } = await params
  return {
    title: "Store",
    description: "Explore all of our products.",
    // Query string stripped: sortBy/page/minPrice/brand/fabric/tag/type
    // multiply into effectively unlimited URLs rendering the same catalog.
    alternates: { canonical: `/${countryCode}/store` },
  }
}

type Params = {
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
    minPrice?: string
    maxPrice?: string
    inStock?: string
    brand?: string
    fabric?: string
    /** Legacy; prefer `tagId` */
    tag?: string
    tagId?: string
    typeId?: string
  }>
  params: Promise<{
    countryCode: string
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

export default async function StorePage({ searchParams, params }: Params) {
  const resolvedSearchParams = await searchParams
  const resolvedParams = await params
  const {
    sortBy,
    page,
    minPrice,
    maxPrice,
    inStock,
    brand,
    fabric,
    tag,
    tagId,
    typeId,
  } = resolvedSearchParams

  const resolvedTagId = tagId?.trim() || tag?.trim() || undefined

  return (
    <StoreTemplate
      sortBy={sortBy}
      page={page}
      minPrice={parsePositiveNumber(minPrice)}
      maxPrice={parsePositiveNumber(maxPrice)}
      inStock={inStock === "1"}
      brand={brand?.trim() || undefined}
      fabric={fabric?.trim() || undefined}
      typeId={typeId?.trim() || undefined}
      tagId={resolvedTagId}
      countryCode={resolvedParams.countryCode}
    />
  )
}
