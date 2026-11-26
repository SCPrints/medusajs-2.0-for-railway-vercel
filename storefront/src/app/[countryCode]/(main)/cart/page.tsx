import { Metadata } from "next"
import { unstable_rethrow } from "next/navigation"
import CartTemplate from "@modules/cart/templates"

import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { stripHeavyCartMetadataForRender } from "@lib/util/strip-cart-metadata"
import { applyDisplayPriceCorrectionToCart } from "@lib/util/apply-display-price-correction"
import { supacolourDesignShortfalls, type SupacolourShortfall } from "@modules/customizer/lib/scp-supacolour-pricing"
import { HttpTypes } from "@medusajs/types"
import { getCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Cart",
  description: "View your cart",
}

const fetchCart = async (): Promise<{ cart: HttpTypes.StoreCart | null; supacolourShortfalls: SupacolourShortfall[] }> => {
  try {
    const cart = await retrieveCart()

    if (!cart) {
      return { cart: null, supacolourShortfalls: [] }
    }

    const supacolourShortfalls = supacolourDesignShortfalls(cart.items ?? [])

    if (cart?.items?.length) {
      const enrichedItems = await enrichLineItems(cart.items, cart.region_id!)
      // Strip heavy customizer metadata (sideLayouts, prints, customerOriginalFiles)
      // before passing to client components. Pure performance optimization for
      // large carts; the cart UI only reads thumbnail / mockup-artifact URLs
      // (still kept) plus top-level scalars. See stripHeavyCartMetadataForRender.
      cart.items = stripHeavyCartMetadataForRender(
        enrichedItems
      ) as HttpTypes.StoreCartLineItem[]
      applyDisplayPriceCorrectionToCart(cart)
    }

    return { cart, supacolourShortfalls }
  } catch (err) {
    // Shell prerenders have no cookies, so cookies() rejects when they finish.
    // That is Next's signal, not a cart failure: hand it back so it isn't logged.
    unstable_rethrow(err)
    console.error("[cart/page] fetchCart threw:", err)
    return { cart: null, supacolourShortfalls: [] }
  }
}

export default async function Cart(){const { cart, supacolourShortfalls } = await fetchCart()
  const customer = await getCustomer()

  return <CartTemplate cart={cart} customer={customer} supacolourShortfalls={supacolourShortfalls} />
}
