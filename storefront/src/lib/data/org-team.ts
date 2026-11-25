"use server"

import { sdk } from "@lib/config"
import { updateTag } from "next/cache"

import { getOrSetCart } from "./cart"
import { getAuthHeaders } from "./cookies"

/**
 * Organisation "People" (roster) and "Our range" (shared designs + the
 * one-screen order form). Backend: /store/customers/me/organisations/:id/
 * roster and /range. Per-customer data — never cached.
 */

export type GarmentGroup = { key: string; label: string }

export type RosterMember = {
  id: string
  name: string
  unit: string | null
  number: string | null
  sizes: Record<string, string>
  notes: string | null
  is_active: boolean
}

export type RosterMemberInput = {
  name: string
  unit?: string | null
  number?: string | null
  sizes?: Record<string, string>
  notes?: string | null
}

export type OrgRoster = { members: RosterMember[]; garment_groups: GarmentGroup[]; can_edit: boolean }

export type RangeItem = {
  design_id: string
  name: string
  thumbnail_url: string | null
  product: { id: string; handle: string | null; title: string | null; thumbnail: string | null } | null
  garment_group: string | null
  base_colour: string | null
  colours: string[]
  variants: Array<{ id: string; colour: string | null; size: string }>
  ready: boolean
  not_ready_reason: string | null
}

export type PackingOption = { key: string; label: string }

export type OrgRange = { items: RangeItem[]; packing_options: PackingOption[]; can_order: boolean }

export type RangeOrderLine = { design_id: string; variant_id: string; quantity: number }

export type RangePrice = {
  currency_code: string
  lines: Array<RangeOrderLine & { unit_price: number; total: number }>
  setup_fees: Array<{ title: string; quantity: number; unit_price: number | null; total: number | null }>
  total_quantity: number
  total: number
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

const base = (orgId: string) => `/store/customers/me/organisations/${encodeURIComponent(orgId)}`
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

const EMPTY_ROSTER: OrgRoster = { members: [], garment_groups: [], can_edit: false }

export async function getOrganisationRoster(orgId: string): Promise<OrgRoster> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return EMPTY_ROSTER
  try {
    return (await sdk.client.fetch(`${base(orgId)}/roster`, { headers, cache: "no-store" })) as OrgRoster
  } catch {
    return EMPTY_ROSTER
  }
}

async function rosterWrite(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown> | undefined,
  fallback: string
): Promise<Result<{ members?: RosterMember[]; member?: RosterMember }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Sign in to manage your people." }
  try {
    const res = (await sdk.client.fetch(path, { method, headers, ...(body ? { body } : {}) })) as {
      members?: RosterMember[]
      member?: RosterMember
    }
    return { ok: true, ...res }
  } catch (err) {
    return { ok: false, error: message(err, fallback) }
  }
}

/** Add people. Returns the whole roster. */
export async function addRosterMembers(orgId: string, members: RosterMemberInput[]) {
  return rosterWrite(`${base(orgId)}/roster`, "POST", { members }, "Couldn't add those people.")
}

/** Replace the whole roster with this list. */
export async function replaceRoster(orgId: string, members: RosterMemberInput[]) {
  return rosterWrite(`${base(orgId)}/roster`, "PUT", { members }, "Couldn't save the list.")
}

export async function updateRosterMember(orgId: string, memberId: string, member: RosterMemberInput) {
  return rosterWrite(
    `${base(orgId)}/roster/${encodeURIComponent(memberId)}`,
    "POST",
    member as Record<string, unknown>,
    "Couldn't save that change."
  )
}

export async function deleteRosterMember(orgId: string, memberId: string) {
  return rosterWrite(`${base(orgId)}/roster/${encodeURIComponent(memberId)}`, "DELETE", undefined, "Couldn't remove them.")
}

const EMPTY_RANGE: OrgRange = { items: [], packing_options: [], can_order: false }

export async function getOrganisationRange(orgId: string): Promise<OrgRange> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return EMPTY_RANGE
  try {
    return (await sdk.client.fetch(`${base(orgId)}/range`, { headers, cache: "no-store" })) as OrgRange
  } catch {
    return EMPTY_RANGE
  }
}

/** This customer's price for the quantities typed so far (server-priced, inc GST). */
export async function priceOrganisationRange(
  orgId: string,
  countryCode: string,
  items: RangeOrderLine[]
): Promise<Result<{ price: RangePrice }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Sign in to see your prices." }
  try {
    const cart = await getOrSetCart(countryCode)
    const price = (await sdk.client.fetch(`${base(orgId)}/range/price`, {
      method: "POST",
      headers,
      body: { cart_id: cart.id, items },
    })) as RangePrice
    return { ok: true, price }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't work out the price just now.") }
  }
}

/** The order form's "Add all to cart". The server builds every line from the stored design. */
export async function addOrganisationRangeToCart(
  orgId: string,
  countryCode: string,
  input: {
    items: RangeOrderLine[]
    /** "all", a list of roster member ids, or null for no names. */
    roster: "all" | string[] | null
    packing: string
    personalisationRequested: boolean
    /** Print sizes for names / numbers (priced per garment), or null. */
    namesNumbers?: { names: string | null; numbers: string | null } | null
  }
): Promise<Result<{ added_lines: number; fees_for_staff: string[] }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Sign in to order." }
  try {
    const cart = await getOrSetCart(countryCode)
    const res = (await sdk.client.fetch(`${base(orgId)}/range/add-to-cart`, {
      method: "POST",
      headers,
      body: {
        cart_id: cart.id,
        items: input.items,
        roster: input.roster,
        packing: input.packing,
        personalisation_requested: input.personalisationRequested,
        ...(input.namesNumbers !== undefined ? { names_numbers: input.namesNumbers } : {}),
      },
    })) as { added_lines: number; fee_lines_added: number; fees_for_staff?: string[] }
    updateTag("cart")
    return { ok: true, added_lines: res.added_lines + res.fee_lines_added, fees_for_staff: res.fees_for_staff ?? [] }
  } catch (err) {
    return { ok: false, error: message(err, "Couldn't add these to your cart just now.") }
  }
}

/** Garments this customer has ordered before (leads the garment picker). [] for guests. */
export async function getUsualGarments(): Promise<Array<{ handle: string; title: string; thumbnail: string | null }>> {
  try {
    const headers = await getAuthHeaders()
    if (!("authorization" in headers)) return []
    const res = (await sdk.client.fetch("/store/customers/me/usual-garments", { headers, cache: "no-store" })) as {
      garments?: Array<{ handle: string; title: string; thumbnail: string | null }>
    }
    return res.garments ?? []
  } catch {
    return []
  }
}
