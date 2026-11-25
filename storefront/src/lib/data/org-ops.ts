"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"

import { getOrSetCart, retrieveCart, updateCart } from "./cart"
import { getAuthHeaders, setCartId } from "./cookies"

/**
 * Organisation extras: uniform allowance, brand kit, held-stock history and
 * split delivery. Backend: /store/customers/me/organisations/:id/{allowances,
 * brand-kit,inventory/:row/movements}, the public /store/allowance/:token and
 * `cart.metadata.split_delivery`. Per-customer data, never cached.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

const base = (orgId: string) => `/store/customers/me/organisations/${encodeURIComponent(orgId)}`
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

async function authed<T>(path: string, init?: { method?: "POST"; body?: Record<string, unknown> }): Promise<T | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch(path, { headers, cache: "no-store", ...init } as any)) as T
  } catch {
    return null
  }
}

/* ── Uniform allowance (owner side) ─────────────────────────────────────── */

export type AllowanceSummary = {
  id: string
  name: string
  unit: string | null
  closes_at: string | null
  closed: boolean
  kind: "batch" | "ongoing"
  delivery: "bulk" | "home"
  items: Array<{ design_id: string; per_person: number }>
  people: number
  picked: number
  added_to_cart: boolean
}

export type AllowanceDetail = {
  allowance: {
    id: string
    name: string
    unit: string | null
    closes_at: string | null
    closed: boolean
    added_to_cart: boolean
    cart_id: string | null
    kind: "batch" | "ongoing"
    delivery: "bulk" | "home"
    items: Array<{ design_id: string; per_person: number; name: string; thumbnail_url: string | null; product_title: string | null }>
  }
  people: Array<{
    roster_member_id: string
    name: string
    unit: string | null
    token: string
    submitted_at: string | null
    ordered: boolean
    address: HomeAddress | null
    picks: Array<{ design_id: string; size: string; quantity: number }>
  }>
  /** Ongoing packs: roster people who don't have a link yet. */
  can_add: Array<{ id: string; name: string; unit: string | null }>
}

export type HomeAddress = {
  name: string
  company: string | null
  address_1: string
  address_2: string | null
  city: string
  province: string
  postal_code: string
  phone: string | null
}

export async function listAllowances(orgId: string): Promise<AllowanceSummary[]> {
  return (await authed<{ allowances: AllowanceSummary[] }>(`${base(orgId)}/allowances`))?.allowances ?? []
}

export async function getAllowance(orgId: string, id: string): Promise<AllowanceDetail | null> {
  return authed<AllowanceDetail>(`${base(orgId)}/allowances/${encodeURIComponent(id)}`)
}

export async function createAllowance(
  orgId: string,
  input: {
    name: string
    closes_on: string | null
    unit: string | null
    items: Array<{ design_id: string; per_person: number }>
    kind: "batch" | "ongoing"
    delivery: "bulk" | "home"
  }
): Promise<Result<{ id: string }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    const res = (await sdk.client.fetch(`${base(orgId)}/allowances`, { method: "POST", headers, body: input })) as { id: string }
    return { ok: true, id: res.id }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't create the allowance.") }
  }
}

export async function setAllowanceClosed(orgId: string, id: string, closed: boolean): Promise<Result> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    await sdk.client.fetch(`${base(orgId)}/allowances/${encodeURIComponent(id)}`, { method: "POST", headers, body: { closed } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't update it.") }
  }
}

/** New-starter pack: give one more roster person their link. */
export async function addAllowancePerson(orgId: string, id: string, rosterMemberId: string): Promise<Result<{ token: string }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    const res = (await sdk.client.fetch(`${base(orgId)}/allowances/${encodeURIComponent(id)}/people`, {
      method: "POST",
      headers,
      body: { roster_member_id: rosterMemberId },
    })) as { token: string }
    return { ok: true, token: res.token }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't add them.") }
  }
}

/**
 * Everything chosen goes into this browser's cart (or the cart it was already
 * put in). New-starter packs: just `rosterMemberId`'s pack.
 */
export async function addAllowanceToCart(
  orgId: string,
  id: string,
  countryCode: string,
  rosterMemberId?: string
): Promise<Result<{ already_added: boolean; left_out: string[]; unmatched: string[]; fees_for_staff: string[]; postage: number }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    const cart = await getOrSetCart(countryCode)
    const res = (await sdk.client.fetch(`${base(orgId)}/allowances/${encodeURIComponent(id)}/add-to-cart`, {
      method: "POST",
      headers,
      body: { cart_id: cart.id, ...(rosterMemberId ? { roster_member_id: rosterMemberId } : {}) },
    })) as { cart_id: string; already_added: boolean; left_out: string[]; unmatched: string[]; fees_for_staff: string[]; postage?: number }
    if (res.cart_id && res.cart_id !== cart.id) await setCartId(res.cart_id)
    revalidateTag("cart", "max")
    return {
      ok: true,
      already_added: res.already_added,
      left_out: res.left_out,
      unmatched: res.unmatched,
      fees_for_staff: res.fees_for_staff,
      postage: res.postage ?? 0,
    }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't add these to your cart just now.") }
  }
}

/* ── Uniform allowance (a person's own link, no login) ──────────────────── */

export type PublicAllowance = {
  allowance: { name: string; closes_at: string | null; delivery: "bulk" | "home" }
  person: { name: string }
  address: HomeAddress | null
  items: Array<{
    design_id: string
    name: string
    thumbnail_url: string | null
    product_title: string | null
    per_person: number
    sizes: string[]
    suggested_size: string | null
  }>
  picks: Array<{ design_id: string; size: string; quantity: number }>
  submitted: boolean
  /** Ordered or closed: show what they chose, read-only. */
  closed?: boolean
}

export async function getPublicAllowance(token: string): Promise<PublicAllowance | null> {
  try {
    return (await sdk.client.fetch(`/store/allowance/${encodeURIComponent(token)}`, { cache: "no-store" } as any)) as PublicAllowance
  } catch {
    return null
  }
}

export async function submitPublicAllowance(
  token: string,
  picks: Array<{ design_id: string; size: string; quantity: number }>,
  address?: HomeAddress | null
): Promise<Result> {
  try {
    await sdk.client.fetch(`/store/allowance/${encodeURIComponent(token)}`, {
      method: "POST",
      body: { picks, ...(address ? { address } : {}) },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't save your choices. The link may have closed.") }
  }
}

/* ── Brand kit ──────────────────────────────────────────────────────────── */

export type BrandKit = {
  colours: Array<{ name: string; hex: string; pantone: string | null }>
  fonts: string[]
  placement_notes: string
  logo_artwork_ids: string[]
}
export type ArtworkLite = { id: string; name: string; url: string; thumbnail_url: string | null }
export type BrandKitPayload = { brand_kit: BrandKit; logos: ArtworkLite[]; shared_artwork: ArtworkLite[]; can_edit: boolean }

export async function getBrandKit(orgId: string): Promise<BrandKitPayload | null> {
  return authed<BrandKitPayload>(`${base(orgId)}/brand-kit`)
}

export async function saveBrandKit(orgId: string, kit: BrandKit): Promise<Result<{ data: BrandKitPayload }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    const data = (await sdk.client.fetch(`${base(orgId)}/brand-kit`, { method: "POST", headers, body: kit as any })) as BrandKitPayload
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't save the brand kit.") }
  }
}

/* ── Held stock: movement history ───────────────────────────────────────── */

export type StockMovement = {
  id: string
  date: string
  direction: "in" | "out" | "reserved" | "released"
  quantity: number
  reason: string
  reference: string | null
}

export async function getStockMovements(orgId: string, inventoryId: string): Promise<StockMovement[]> {
  return (
    (await authed<{ movements: StockMovement[] }>(`${base(orgId)}/inventory/${encodeURIComponent(inventoryId)}/movements`))?.movements ?? []
  )
}

/* ── Split delivery (checkout) ──────────────────────────────────────────── */

export type SplitInput = Array<{ destination_id: string; lines: Array<{ line_id: string; quantity: number }> }>

/** The cart's lines that are delivered (not setup-fee service lines), for the split form. */
export async function getSplittableCart(): Promise<{
  lines: Array<{ id: string; title: string; quantity: number }>
  split: Array<{ destination_id: string; lines: Array<{ line_id: string; quantity: number }> }> | null
} | null> {
  const cart = await retrieveCart()
  if (!cart?.id) return null
  const meta = (cart.metadata ?? {}) as Record<string, any>
  return {
    lines: (cart.items ?? [])
      .filter((i: any) => !i.metadata?.screen_setup_for_order && !i.metadata?.supacolour_setup_for_order)
      .map((i: any) => ({ id: i.id, title: i.product_title ? `${i.product_title}${i.variant_title ? ` · ${i.variant_title}` : ""}` : i.title, quantity: i.quantity })),
    split: Array.isArray(meta.split_delivery) ? meta.split_delivery : null,
  }
}

/** Save (or with null, clear) the split on the cart. The backend checks every part again. */
export async function saveSplitDelivery(orgId: string, split: SplitInput | null): Promise<Result> {
  const cart = await retrieveCart()
  if (!cart?.id) return { ok: false, error: "Your cart has expired." }
  const current = (cart.metadata ?? {}) as Record<string, unknown>
  if (!split && !current.split_delivery) return { ok: true }
  try {
    await updateCart({ metadata: { ...current, organisation_id: orgId, split_delivery: split ?? "" } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't save the split.") }
  }
}
