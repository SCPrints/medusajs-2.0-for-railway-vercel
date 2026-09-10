"use client"

import type { ComponentProps } from "react"

import { useProductOptions } from "@modules/products/context/product-options-context"

import EmbeddedProductCustomizer from "./embedded-product-customizer"

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
