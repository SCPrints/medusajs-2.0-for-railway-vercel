"use server"

import { updateTag } from "next/cache"
import { sdk } from "@lib/config"

/** Add a sizing kit (one blank per size) to the cart. Returns an error message, or null on success. */
export async function addSizingKit(variantIds: string[], countryCode: string): Promise<string | null> {
  const [{ getAuthHeaders }, { getOrSetCart }] = await Promise.all([import("./cookies"), import("./cart")])
  const cart = await getOrSetCart(countryCode)
  if (!cart?.id) return "Your cart could not be opened."
  try {
    await sdk.client.fetch(`/store/carts/${cart.id}/sizing-kit`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { variant_ids: variantIds },
    })
    updateTag("cart")
    return null
  } catch (e: any) {
    return typeof e?.message === "string" && e.message ? e.message : "We couldn't add the kit. Try again."
  }
}
