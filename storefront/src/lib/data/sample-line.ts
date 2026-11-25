"use server"

import { updateTag } from "next/cache"
import { sdk } from "@lib/config"

/** Turn a cart line into one sample garment. Returns an error message, or null on success. */
export async function makeSampleLine(lineId: string): Promise<string | null> {
  const { getAuthHeaders, getCartId } = await import("./cookies")
  const cartId = await getCartId()
  if (!cartId) return "Your cart could not be found."
  try {
    await sdk.client.fetch(`/store/carts/${cartId}/sample-line`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { line_id: lineId },
    })
    updateTag("cart")
    return null
  } catch (e: any) {
    return typeof e?.message === "string" && e.message ? e.message : "We could not set up a sample. Try again."
  }
}
