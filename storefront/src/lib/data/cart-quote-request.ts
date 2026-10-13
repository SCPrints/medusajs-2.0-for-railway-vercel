"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { getAuthHeaders, getCartId } from "./cookies"

/**
 * Cart "Email me a quote / proof": copies the current cart (designs intact)
 * into a quote for staff to proof and send a payment link. The cart id comes
 * from the cookie, never the client. Saves the email onto the cart first when
 * it's a guest cart without one (the quote needs somewhere to send the proof).
 */
export async function requestCartQuote(input: {
  email: string
  phone?: string
  note?: string
}): Promise<{ ok: true; publicId: string } | { ok: false; error: string }> {
  const cartId = await getCartId()
  if (!cartId) return { ok: false, error: "Your cart has expired — please add your items again." }

  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." }

  try {
    await sdk.store.cart.update(cartId, { email }, {}, await getAuthHeaders())
    revalidateTag("cart", "max")
    const res = (await sdk.client.fetch("/store/cart-quote-requests", {
      method: "POST",
      body: { cart_id: cartId, contact_phone: input.phone?.trim() || undefined, note: input.note?.trim() || undefined },
    })) as { success?: boolean; public_id?: string }
    if (!res?.success || !res.public_id) return { ok: false, error: "We couldn't send your request. Please try again." }
    return { ok: true, publicId: res.public_id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "We couldn't send your request." }
  }
}
