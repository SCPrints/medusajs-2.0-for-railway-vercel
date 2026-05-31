import { Metadata } from "next"

import { getProductsList } from "@lib/data/products"
import ProductCityClient from "./product-city-client"

/**
 * Preview route for the interactive product-tile hero: a perspective grid where
 * every tile's top is a product image — hover lifts a tile, click opens the
 * product. A/B against /au (rain), /au/city-hero, /au/block-hero, /au/space-hero.
 * Noindex,nofollow.
 */
export const metadata: Metadata = {
  title: "Product city hero (preview)",
  robots: { index: false, follow: false },
}

export default async function ProductCityPreviewPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params

  const { response } = await getProductsList({
    countryCode,
    queryParams: { limit: 40 },
  })
  const products = (response?.products ?? [])
    .filter((p) => p.thumbnail && p.handle)
    .map((p) => ({
      thumbnail: p.thumbnail as string,
      handle: p.handle as string,
      title: p.title ?? "",
    }))

  return (
    <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#0c0b1a]">
      <ProductCityClient products={products} countryCode={countryCode} />

      {/* Minimal, non-blocking heading (pointer-events-none so every tile stays
          hoverable/clickable). Products are the hero here. */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-6 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
          Custom Apparel · NSW, AU
        </p>
        <h1
          className="mt-2 max-w-md text-3xl font-semibold leading-tight text-white small:text-4xl"
          style={{ textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}
        >
          Our range, block by block.
        </h1>
        <p className="mt-2 text-sm text-white/70">Hover to lift · click to open a product</p>
      </div>
    </section>
  )
}
