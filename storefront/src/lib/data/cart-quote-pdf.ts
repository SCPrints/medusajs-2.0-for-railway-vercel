"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"

import { getAuthHeaders, getCartId } from "./cookies"

/**
 * Cart "Download a quote": a guest cart needs an email before it can be saved
 * as a quote. The cart id comes from the cookie, never the client. The PDF
 * itself is served by /api/cart/quote-pdf.
 */
export async function setCartEmailForQuote(rawEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cartId = await getCartId()
  if (!cartId) return { ok: false, error: "Your cart has expired. Please add your items again." }
  const email = rawEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." }
  try {
    await sdk.store.cart.update(cartId, { email }, {}, await getAuthHeaders())
    revalidateTag("cart", "max")
    return { ok: true }
  } catch {
    return { ok: false, error: "We couldn't save your email. Please try again." }
  }
}
