import { notFound } from "next/navigation"
import CartDropdown from "../cart-dropdown"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { applyDisplayPriceCorrectionToCart } from "@lib/util/apply-display-price-correction"

const fetchCart = async () => {
  const cart = await retrieveCart()

  if (!cart) {
    return null
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart.items, cart.region_id!)
    cart.items = enrichedItems
    applyDisplayPriceCorrectionToCart(cart)
  }

  return cart
}

export default async function CartButton() {
  const cart = await fetchCart()

  return <CartDropdown cart={cart} />
}
