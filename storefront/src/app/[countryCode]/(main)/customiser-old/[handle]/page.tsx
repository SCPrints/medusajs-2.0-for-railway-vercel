import { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductTemplate from "@modules/products/templates"
import { getRegion } from "@lib/data/regions"
import { getProductByHandle } from "@lib/data/products"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

// Recovery route — serves the LEGACY split-tabs PDP customizer for a single
// product, regardless of the `PDP_STUDIO` cutover flag. Unlinked (nothing in
// the UI points here) and intentionally `noindex`: it exists only so the old
// experience stays reachable/diffable after the studio becomes the default PDP.
// The canonical points at the real product page so any stray link consolidates
// there instead of competing with it in search.
//
// See `products/[handle]/page.tsx` for why there's no `generateStaticParams`.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, countryCode } = await params
  const normalizedCountryCode = String(countryCode ?? "").trim().toLowerCase()
  const normalizedHandle = decodeURIComponent(String(handle ?? "")).trim().toLowerCase()

  return {
    title: "Customizer (legacy)",
    description: "Legacy product customizer.",
    robots: { index: false, follow: false },
    alternates: {
      // Consolidate onto the real, indexable product page.
      canonical: `/${normalizedCountryCode}/products/${normalizedHandle}`,
    },
  }
}

export default async function CustomiserOldPage({ params }: Props) {
  const { countryCode, handle } = await params
  const normalizedCountryCode = String(countryCode ?? "").trim().toLowerCase()
  const normalizedHandle = decodeURIComponent(String(handle ?? "")).trim().toLowerCase()
  const region = await getRegion(normalizedCountryCode)

  if (!region) {
    notFound()
  }

  const pricedProduct = await getProductByHandle(normalizedHandle, region.id)
  if (!pricedProduct) {
    notFound()
  }

  return (
    <ProductTemplate
      product={pricedProduct}
      region={region}
      countryCode={normalizedCountryCode}
      customizerMode="split-tabs"
    />
  )
}
