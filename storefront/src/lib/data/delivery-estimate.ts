"use server"

import { getProductionEta } from "./production-eta"
import { retrieveCart, updateCart } from "./cart"

export type RushRequest = { tier: "priority" | "express"; needed_by?: string }

/** Production window in business days (cached 15 min), or null when unavailable. */
export async function getDeliveryEta(): Promise<{ low_days: number; high_days: number } | null> {
  const eta = await getProductionEta()
  return eta ? { low_days: eta.low_days, high_days: eta.high_days } : null
}

/**
 * "Need it sooner?" request on the cart (`cart.metadata.rush_request`).
 * No price is set or charged; staff confirm it. null clears it.
 */
export async function setCartRushRequest(
  req: RushRequest | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cart = await retrieveCart()
  if (!cart?.id) return { ok: false, error: "Your cart has expired." }
  const current = (cart.metadata ?? {}) as Record<string, unknown>
  try {
    // "" clears the key (Medusa treats "" as remove), and the backend cleaner normalises it.
    await updateCart({ metadata: { ...current, rush_request: req ?? "" } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save your request." }
  }
}
