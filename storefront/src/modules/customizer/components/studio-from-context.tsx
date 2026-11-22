"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

import { useProductOptions } from "@modules/products/context/product-options-context"

// Fabric + the Studio are ~190 KB gzipped, so they stay out of the PDP's first
// load (StudioLauncher warms them after load). No `loading` option on purpose:
// the template's Suspense fallback ("Loading the design studio…") covers it.
const EmbeddedProductCustomizer = dynamic(() => import("./embedded-product-customizer"))

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
  return <EmbeddedProductCustomizer product={product} {...props} />
}
