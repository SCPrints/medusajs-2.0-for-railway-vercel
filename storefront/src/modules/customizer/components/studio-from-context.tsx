"use client"

import { lazy, useState, type ComponentProps } from "react"

import { useProductOptions } from "@modules/products/context/product-options-context"
import type EmbeddedProductCustomizer from "./embedded-product-customizer"

let loadedStudio: typeof EmbeddedProductCustomizer | undefined

/**
 * Fabric + the Studio are ~190 KB gzipped, so they stay out of the PDP's first
 * load. StudioLauncher calls this once the page has loaded.
 */
export const loadStudio = async () => {
  const studio = await import("./embedded-product-customizer")
  loadedStudio = studio.default
  return studio
}

// Only used if the Studio opens before it has downloaded. Not next/dynamic:
// that suspends on first render even when the code is already here, and React
// then holds the "Loading the design studio…" fallback for 300 ms.
const LazyStudio = lazy(loadStudio)

type Props = Omit<ComponentProps<typeof EmbeddedProductCustomizer>, "product">

/**
 * The PDP's studio slot streams behind cookies() (customer tier / contact) in
 * its own dynamic render. Taking `product` as a prop there made the server
 * serialise the whole product a second time; reading it from
 * ProductOptionsContext (mounted in the static shell) keeps the dynamic slot's
 * payload down to tier + print profile + contact.
 */
export default function StudioFromContext(props: Props) {
  const { product } = useProductOptions()
  // Chosen once per mount: switching component type would remount the canvas.
  const [Studio] = useState(() => loadedStudio ?? LazyStudio)
  return <Studio product={product} {...props} />
}
