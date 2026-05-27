"use server"

import { sdk } from "@lib/config"
import {
  ALL_ORG_TAGS_FOR,
  ORG_DESIGNS_TAG,
  ORG_DESTINATIONS_TAG,
  ORG_DETAIL_TAG,
  ORG_INVENTORY_TAG,
  ORG_MEMBERS_TAG,
  ORG_ORDERS_TAG,
} from "@lib/util/org-cache-tags"
import { revalidateTag } from "next/cache"

import { getAuthHeaders } from "./cookies"

export type OrgRole = "owner" | "purchaser" | "viewer"

export type Membership = {
  organisation: {
    id: string
    handle: string
    name: string
    contact_email: string | null
    notes: string | null
    default_pricing_tier: string | null
    tax_exempt: boolean
  } | null
  role: OrgRole
  joined_at: string | null
}

export type OrganisationDetail = {
  organisation: {
    id: string
    handle: string
    name: string
    contact_email: string | null
    contact_phone: string | null
    notes: string | null
    tax_exempt: boolean
    metadata: Record<string, unknown> | null
  }
  role: OrgRole
}

export type OrganisationDesign = {
  id: string
  organisation_id: string
  name: string
  code: string | null
  thumbnail_url: string | null
  is_active: boolean
  created_at: string
}

export type OrganisationDestination = {
  id: string
  organisation_id: string
  name: string
  code: string | null
  address_1: string
  address_2: string | null
  city: string
  province: string | null
  postal_code: string
  country_code: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  delivery_notes: string | null
  is_active: boolean
}

export type InventoryRow = {
  id: string
  organisation_id: string
  product_variant_id: string
  organisation_design_id: string
  fulfillment_mode: "held_stock" | "print_on_demand"
  unit_price: number // cents
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  reorder_point: number | null
  lead_time_days: number | null
  customer_facing_label: string | null
  is_active: boolean
  variant_title: string | null
  product_title: string | null
  design_name: string | null
  design_thumbnail_url: string | null
}

export type OrgOrderSummary = {
  id: string
  display_id: string | number
  total: number
  currency_code: string
  status: string
  created_at: string
  production_stage: string | null
  destination_id: string | null
  external_ref: string | null
  placed_by_customer_id: string | null
  line_count: number
  design_summary: string[]
  quantity_total: number
}

export type OrgOrderDetail = {
  order: any
  destination: OrganisationDestination | null
  placed_by: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
  } | null
  role: OrgRole
}

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

export async function listMyOrganisations(): Promise<Membership[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  try {
    const res = (await sdk.client.fetch("/store/customers/me/organisations", {
      headers,
    })) as { organisations?: Membership[] }
    return res.organisations ?? []
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ *
 * Per-org reads (tagged for revalidation)
 * ------------------------------------------------------------------ */

export async function getOrganisationDetail(
  id: string
): Promise<OrganisationDetail | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}`,
      {
        headers,
        next: { tags: [ORG_DETAIL_TAG(id)] },
      } as any
    )) as { organisation: any; role: OrgRole }
    if (!res?.organisation) return null
    return { organisation: res.organisation, role: res.role }
  } catch {
    return null
  }
}

export async function getOrganisationDesigns(
  id: string
): Promise<OrganisationDesign[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/designs`,
      {
        headers,
        next: { tags: [ORG_DESIGNS_TAG(id)] },
      } as any
    )) as { designs?: OrganisationDesign[] }
    return res.designs ?? []
  } catch {
    return []
  }
}

export async function getOrganisationDestinations(
  id: string,
  opts?: { activeOnly?: boolean }
): Promise<OrganisationDestination[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  const qs = opts?.activeOnly ? "?active=1" : ""
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/destinations${qs}`,
      {
        headers,
        next: { tags: [ORG_DESTINATIONS_TAG(id)] },
      } as any
    )) as { destinations?: OrganisationDestination[] }
    return res.destinations ?? []
  } catch {
    return []
  }
}

export async function getOrganisationInventory(
  id: string,
  opts?: {
    designId?: string
    mode?: "held_stock" | "print_on_demand"
    belowReorderOnly?: boolean
  }
): Promise<InventoryRow[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  const params = new URLSearchParams()
  if (opts?.designId) params.set("design_id", opts.designId)
  if (opts?.mode) params.set("mode", opts.mode)
  if (opts?.belowReorderOnly) params.set("below_reorder", "1")
  const qs = params.toString() ? `?${params.toString()}` : ""
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/inventory${qs}`,
      {
        headers,
        next: { tags: [ORG_INVENTORY_TAG(id)] },
      } as any
    )) as { inventory?: InventoryRow[] }
    return res.inventory ?? []
  } catch {
    return []
  }
}

export async function getOrganisationOrders(
  id: string,
  opts?: {
    limit?: number
    offset?: number
    destinationId?: string
  }
): Promise<{ orders: OrgOrderSummary[]; count: number }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { orders: [], count: 0 }
  const params = new URLSearchParams()
  if (opts?.limit) params.set("limit", String(opts.limit))
  if (opts?.offset) params.set("offset", String(opts.offset))
  if (opts?.destinationId) params.set("destination_id", opts.destinationId)
  const qs = params.toString() ? `?${params.toString()}` : ""
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/orders${qs}`,
      {
        headers,
        next: { tags: [ORG_ORDERS_TAG(id)] },
      } as any
    )) as { orders?: OrgOrderSummary[]; count?: number }
    return { orders: res.orders ?? [], count: res.count ?? 0 }
  } catch {
    return { orders: [], count: 0 }
  }
}

export async function getOrganisationOrderDetail(
  id: string,
  orderId: string
): Promise<OrgOrderDetail | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}`,
      {
        headers,
        next: { tags: [ORG_ORDERS_TAG(id)] },
      } as any
    )) as OrgOrderDetail
    return res?.order ? res : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Mutations — fire off the revalidation locally too so the page that
 * triggered the action sees fresh data on the next render.
 * ------------------------------------------------------------------ */

export async function placeOrganisationOrder(
  id: string,
  payload: {
    destination_id: string
    items: Array<{ org_inventory_id: string; quantity: number }>
    external_ref?: string
    required_by?: string
    notes?: string
  }
): Promise<
  | { ok: true; order_id: string }
  | { ok: false; error: string }
> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to place an order." }
  }
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/orders`,
      {
        method: "POST",
        headers,
        body: payload,
      }
    )) as { order_id?: string }
    if (!res?.order_id) {
      return { ok: false, error: "Failed to place order." }
    }
    // Bust both orders + inventory caches — placing an order reserves
    // stock which shifts inventory.available downstream.
    revalidateTag(ORG_ORDERS_TAG(id), "max")
    revalidateTag(ORG_INVENTORY_TAG(id), "max")
    return { ok: true, order_id: res.order_id }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to place order.",
    }
  }
}

export async function cancelOrganisationOrder(
  id: string,
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to cancel." }
  }
  try {
    await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}/cancel`,
      { method: "POST", headers }
    )
    revalidateTag(ORG_ORDERS_TAG(id), "max")
    revalidateTag(ORG_INVENTORY_TAG(id), "max")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cancel order.",
    }
  }
}

/* ------------------------------------------------------------------ *
 * Cache invalidation helper (used by /api/revalidate-org)
 * ------------------------------------------------------------------ */

export async function invalidateOrganisationCache(id: string): Promise<void> {
  for (const tag of ALL_ORG_TAGS_FOR(id)) {
    revalidateTag(tag, "max")
  }
}

/* ------------------------------------------------------------------ *
 * Members tab — owners can invite, change role, remove
 * ------------------------------------------------------------------ */

export type OrgMember = {
  id: string
  customer_id: string
  role: OrgRole
  accepted_at: string | null
  invited_by: string | null
  customer: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
  } | null
}

export async function getOrganisationMembers(id: string): Promise<OrgMember[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/members`,
      {
        headers,
        next: { tags: [ORG_MEMBERS_TAG(id)] },
      } as any
    )) as { members?: OrgMember[] }
    return res.members ?? []
  } catch {
    return []
  }
}

export async function inviteOrganisationMember(
  id: string,
  payload: { email: string; role: OrgRole }
): Promise<
  | { ok: true; member: OrgMember }
  | { ok: false; error: string; status?: number }
> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to invite members." }
  }
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/members`,
      {
        method: "POST",
        headers,
        body: payload,
      }
    )) as { member?: OrgMember; error?: string }
    if (!res?.member) {
      return { ok: false, error: res?.error ?? "Failed to invite." }
    }
    revalidateTag(ORG_MEMBERS_TAG(id), "max")
    return { ok: true, member: res.member }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to invite.",
    }
  }
}

export async function updateOrganisationMemberRole(
  id: string,
  memberId: string,
  role: OrgRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to manage members." }
  }
  try {
    await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`,
      { method: "POST", headers, body: { role } }
    )
    revalidateTag(ORG_MEMBERS_TAG(id), "max")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update role.",
    }
  }
}

export async function removeOrganisationMember(
  id: string,
  memberId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to manage members." }
  }
  try {
    await sdk.client.fetch(
      `/store/customers/me/organisations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE", headers }
    )
    revalidateTag(ORG_MEMBERS_TAG(id), "max")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to remove member.",
    }
  }
}
