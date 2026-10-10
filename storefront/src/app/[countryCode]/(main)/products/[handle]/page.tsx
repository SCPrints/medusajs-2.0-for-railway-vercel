import { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import legacyHandles from "@lib/data/legacy-handles.json"

import ProductTemplate from "@modules/products/templates"
import { getRegion } from "@lib/data/regions"
import { getProductByHandle } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { buildAbsoluteUrl, metaDescription, SEO } from "@lib/util/seo"
import { safeJsonLd } from "@lib/util/json-ld"

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

  const description = metaDescription(
    product.description,
    `${product.title} — custom printing & embroidery from SC PRINTS.`
  )
  // "Staple Tee" means nothing in a results page; "AS Colour Staple Tee,
  // custom printed" says what it is and what we do to it. Skip the brand
  // prefix when the supplier already put it in the title.
  const rawBrand = (product as any).brand
  const brandName: string | undefined = (Array.isArray(rawBrand) ? rawBrand[0] : rawBrand)?.name
  const needsBrand =
    brandName && !product.title.toLowerCase().includes(brandName.toLowerCase())
  const title = `${needsBrand ? `${brandName} ` : ""}${product.title}, custom printed`

  return {
    title,
    description,
    alternates: { canonical: `/${normalizedCountryCode}/products/${product.handle}` },
    openGraph: {
      url: buildAbsoluteUrl(`/${normalizedCountryCode}/products/${product.handle}`),
      title: `${title} | ${SEO.siteName}`,
      description,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
    twitter: {
      title: `${title} | ${SEO.siteName}`,
      description,
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
    // Pre-2026-10 AS Colour handles ("as-colour-5001-5001") were renamed to
    // readable ones; keep old links + Google alive with a 301.
    const renamed = (legacyHandles as Record<string, string>)[normalizedHandle]
    if (renamed) permanentRedirect(`/${normalizedCountryCode}/products/${renamed}`)
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
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "AU",
            returnPolicyCategory:
              "https://schema.org/MerchantReturnNotPermitted",
          },
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: {
              "@type": "MonetaryAmount",
              value: "11.00",
              currency: "AUD",
            },
            shippingDestination: {
              "@type": "DefinedRegion",
              addressCountry: "AU",
            },
            deliveryTime: {
              "@type": "ShippingDeliveryTime",
              handlingTime: {
                "@type": "QuantitativeValue",
                minValue: 3,
                maxValue: 14,
                unitCode: "DAY",
              },
              transitTime: {
                "@type": "QuantitativeValue",
                minValue: 1,
                maxValue: 5,
                unitCode: "DAY",
              },
            },
          },
        }
      : undefined,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(productStructuredData) }}
      />
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={normalizedCountryCode}
      />
    </>
  )
}
