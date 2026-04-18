import { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductTemplate from "@modules/products/templates"
import { getRegion, listRegions } from "@lib/data/regions"
import { getProductByHandle, getProductsList } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"

type Props = {
  params: { countryCode: string; handle: string }
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
  const { handle } = params
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const product = await getProductByHandle(handle, region.id)

  if (!product) {
    notFound()
  }

  return {
    title: product.title,
    description: `${product.title}`,
    alternates: {
      canonical: `/${params.countryCode}/products/${product.handle}`,
    },
    openGraph: {
      url: buildAbsoluteUrl(`/${params.countryCode}/products/${product.handle}`),
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
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const pricedProduct = await getProductByHandle(params.handle, region.id)
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
          url: buildAbsoluteUrl(`/${params.countryCode}/products/${pricedProduct.handle}`),
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
        countryCode={params.countryCode}
      />
    </>
  )
}
