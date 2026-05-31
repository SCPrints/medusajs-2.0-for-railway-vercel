"use client"

import dynamic from "next/dynamic"

type Product = { thumbnail: string; handle: string; title: string }

/** Three.js scene → client-only (WebGL/window at import); Next 15 needs ssr:false
 * inside a Client Component. */
const BlockProductHero = dynamic(
  () => import("@modules/home/components/block-product-hero"),
  { ssr: false }
)

export default function ProductCityClient({
  products,
  countryCode,
}: {
  products: Product[]
  countryCode: string
}) {
  return (
    <BlockProductHero
      products={products}
      countryCode={countryCode}
      style={{ position: "absolute", inset: 0, height: "100%" }}
    />
  )
}
