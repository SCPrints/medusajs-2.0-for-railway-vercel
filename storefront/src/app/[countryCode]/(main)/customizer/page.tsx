import { Metadata } from "next"
import { HttpTypes } from "@medusajs/types"
import { getProductsList } from "@lib/data/products"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import CustomizerTemplate from "@modules/customizer/templates"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

type CustomizerPageProps = {
  params: Promise<{ countryCode: string }>
}

const SHIRT_KEYWORDS = ["t-shirt", "t shirt", "tee", "shirt", "singlet", "polo"]

const extractProductImage = (product: HttpTypes.StoreProduct) => {
  const candidateImage = product?.images?.find((image) => typeof image?.url === "string")?.url

  if (candidateImage) {
    return {
      url: candidateImage,
      title: product?.title ?? "Product garment",
    }
  }

  if (typeof product?.thumbnail === "string" && product.thumbnail) {
    return {
      url: product.thumbnail,
      title: product?.title ?? "Product garment",
    }
  }

  return null
}

const findDefaultGarmentImage = (products: HttpTypes.StoreProduct[]) => {
  const shirtProduct = products.find((product) => {
    const title = (product.title ?? "").toLowerCase()
    const handle = (product.handle ?? "").toLowerCase()
    return SHIRT_KEYWORDS.some((keyword) => title.includes(keyword) || handle.includes(keyword))
  })

  if (shirtProduct) {
    const shirtImage = extractProductImage(shirtProduct)
    if (shirtImage) {
      return shirtImage
    }
  }

  for (const product of products) {
    const productImage = extractProductImage(product)
    if (productImage) {
      return productImage
    }
  }

  return null
}

const getConfiguredCustomizerHandle = () => {
  const envHandle =
    process.env.CUSTOMIZER_DEFAULT_PRODUCT_HANDLE ??
    process.env.NEXT_PUBLIC_CUSTOMIZER_DEFAULT_PRODUCT_HANDLE

  return typeof envHandle === "string" && envHandle.trim() ? envHandle.trim() : null
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/customizer`
  const description =
    "Upload your logo and position it on a garment mockup with a live drag-and-resize customizer."

  return {
    title: "Logo Customizer",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Logo Customizer | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Logo Customizer | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default async function CustomizerPage({ params }: CustomizerPageProps) {
  const { countryCode } = await params
  const configuredHandle = getConfiguredCustomizerHandle()
  let defaultGarment: { url: string; title: string } | null = null

  if (configuredHandle) {
    const {
      response: { products: configuredProducts },
    } = await getProductsList({
      countryCode,
      queryParams: {
        handle: configuredHandle,
        limit: 1,
      },
    })
    defaultGarment = findDefaultGarmentImage(configuredProducts)
  }

  const {
    response: { products },
  } = await getProductsList({
    countryCode,
    queryParams: {
      limit: 24,
    },
  })

  if (!defaultGarment) {
    defaultGarment = findDefaultGarmentImage(products)
  }

  return (
    <CustomizerTemplate
      defaultGarmentImage={defaultGarment?.url ?? null}
      defaultGarmentTitle={defaultGarment?.title ?? null}
      products={products}
    />
  )
}
