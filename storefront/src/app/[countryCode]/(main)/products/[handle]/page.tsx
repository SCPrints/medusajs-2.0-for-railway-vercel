import { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductTemplate from "@modules/products/templates"
import { getRegion } from "@lib/data/regions"
import { getProductByHandle } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

// No `generateStaticParams` here.
//
// Previously this route prerendered every (country × handle) pair at build
// time by fanning out one product-list call per region. That call routinely
// timed out the Vercel build whenever the backend slowed (Sydney Fly machine
// + heavy field expansion = ~10-60s per list response), and 4 of 18 deploys
// failed at "Collecting page data for /[countryCode]/products/[handle]" in
// the May 2026 audit.
//
// Cache Components + `"use cache"` on `getProductByHandle` already cache
// each rendered page for ~120s after the first request, so the runtime cost
// is one slow SSR per (country, handle) pair, then fast for everyone else.
// That's much better than failing the entire build over a single slow
// backend call.
//
// (Cache Components rejects `generateStaticParams` returning `[]` — must
// either omit the function entirely or pre-render ≥1 real param.)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, countryCode } = await params
  const normalizedCountryCode = String(countryCode ?? "").trim().toLowerCase()
  const normalizedHandle = decodeURIComponent(String(handle ?? "")).trim().toLowerCase()
  const region = await getRegion(normalizedCountryCode)
  const product = region ? await getProductByHandle(normalizedHandle, region.id) : null

  if (!region || !product) {
    return {
      title: "Product",
      description: "Product details and customizer.",
      alternates: { canonical: `/${normalizedCountryCode}/products/${normalizedHandle}` },
    }
  }

  return {
    title: product.title,
    description: `${product.title}`,
    alternates: { canonical: `/${normalizedCountryCode}/products/${product.handle}` },
    openGraph: {
      url: buildAbsoluteUrl(`/${normalizedCountryCode}/products/${product.handle}`),
      title: `${product.title} | ${SEO.siteName}`,
      description: `${product.title}`,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
    twitter: {
      title: `${product.title} | ${SEO.siteName}`,
      description: `${product.title}`,
      images: product.thumbnail ? [product.thumbnail] : [SEO.ogImage],
    },
  }
}

export default async function ProductPage({ params }: Props) {
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

  const { cheapestPrice } = getProductPrice({ product: pricedProduct })
  const productStructuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pricedProduct.title,
    description: pricedProduct.description ?? pricedProduct.title,
    image: pricedProduct.thumbnail ? [pricedProduct.thumbnail] : [buildAbsoluteUrl(SEO.ogImage)],
    sku: pricedProduct.variants?.[0]?.sku ?? undefined,
    brand: {
      "@type": "Brand",
      name: SEO.siteName,
    },
    offers: cheapestPrice
      ? {
          "@type": "Offer",
          url: buildAbsoluteUrl(`/${normalizedCountryCode}/products/${pricedProduct.handle}`),
          priceCurrency: cheapestPrice.currency_code.toUpperCase(),
          price: cheapestPrice.calculated_price_number,
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
        }
      : undefined,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData) }}
      />
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={normalizedCountryCode}
      />
    </>
  )
}
