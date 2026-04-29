import { Metadata } from "next"

import { isAsColourStoreBrand, isRamoStoreBrand } from "@modules/brands/data/brands"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}): Promise<Metadata> {
  const { brand } = await searchParams
  if (isRamoStoreBrand(brand)) {
    return {
      title: "Ramo",
      description: "Ramo by Stanley/Stella — explore products.",
    }
  }
  if (isAsColourStoreBrand(brand)) {
    return {
      title: "AS Colour",
      description: "Browse AS Colour basics and apparel.",
    }
  }
  return {
    title: "Store",
    description: "Explore all of our products.",
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
    tag?: string
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
  const { sortBy, page, minPrice, maxPrice, inStock, brand, fabric, tag } = resolvedSearchParams

  return (
    <StoreTemplate
      sortBy={sortBy}
      page={page}
      minPrice={parsePositiveNumber(minPrice)}
      maxPrice={parsePositiveNumber(maxPrice)}
      inStock={inStock === "1"}
      brand={brand?.trim() || undefined}
      fabric={fabric?.trim() || undefined}
      tag={tag?.trim() || undefined}
      countryCode={resolvedParams.countryCode}
    />
  )
}
