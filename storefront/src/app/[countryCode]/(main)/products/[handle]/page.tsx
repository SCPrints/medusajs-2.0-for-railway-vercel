import { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductTemplate from "@modules/products/templates"
import { getRegion, listRegions } from "@lib/data/regions"
import { getProductByHandle, getProductsList } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { minorToMajor } from "@lib/util/money"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

export async function generateStaticParams() {
  const countryCodes = await listRegions().then(
    (regions) =>
      regions
        ?.map((r) => r.countries?.map((c) => c.iso_2))
        .flat()
        .filter(Boolean) as string[]
  )

  if (!countryCodes) {
    return null
  }

  const products = await Promise.all(
    countryCodes.map((countryCode) => {
      return getProductsList({ countryCode })
    })
  ).then((responses) =>
    responses.map(({ response }) => response.products).flat()
  )

  const staticParams = countryCodes
    ?.map((countryCode) =>
      products.map((product) => ({
        countryCode,
        handle: product.handle,
      }))
    )
    .flat()

  return staticParams
}

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
          price: minorToMajor(cheapestPrice.calculated_price_number),
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
