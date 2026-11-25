"use server"

/**
 * Buying on account for an organisation: account terms, blanket purchase
 * orders, cost centres, spending limits, drafts + approvals, invoices.
 * Backend: /store/customers/me/organisations/:id/{account,purchase-orders,
 * cost-centres,carts,invoices}. Money is AUD inc GST, in dollars.
 * Nothing here is cached: these are live money figures.
 */
import { sdk } from "@lib/config"
import { updateTag } from "next/cache"

import { retrieveCart, updateCart } from "./cart"
import { getAuthHeaders, getCartId, removeCartId, setCartId } from "./cookies"
import { listMyOrganisations, type OrgRole } from "./organisations"

export type OrgPurchaseOrder = {
  id: string
  number: string
  amount: number
  drawn: number
  remaining: number
  expires_at: string | null
  is_active: boolean
  expired: boolean
}

export type OrgCostCentre = { id: string; code: string; name: string; is_active: boolean }

export type OrgAccount = {
  role: OrgRole
  organisation: { id: string; name: string }
  account: {
    terms_enabled: boolean
    terms_days: number
    credit_limit: number | null
    outstanding: number
    available: number | null
    ap_email: string | null
  }
  my: { order_limit: number | null; monthly_limit: number | null; month_spend: number }
  purchase_orders: OrgPurchaseOrder[]
  cost_centres: OrgCostCentre[]
  /** Only with a cart: how this cart may be ordered for the organisation. */
  checkout: {
    total: number
    needs_approval: string | null
    pay_on_account: { ok: true } | { ok: false; message: string } | null
  } | null
}

export type OrgMemberLimit = {
  member_id: string
  customer_id: string
  name: string
  email: string | null
  role: OrgRole
  order_limit: number | null
  monthly_limit: number | null
  month_spend: number
}

export type OrgCartStatus = "draft" | "awaiting_approval" | "approved" | "declined" | "ordered"

export type OrgCartRow = {
  id: string
  cart_id: string
  name: string
  status: OrgCartStatus
  cost_centre: string | null
  note: string | null
  created_by_name: string
  is_mine: boolean
  created_at: string
  decided_by_name: string | null
  decided_at: string | null
  decline_reason: string | null
  total: number | null
  item_count: number
  order_id: string | null
  can_approve: boolean
  can_open: boolean
}

export type OrgCartDetail = {
  id: string
  name: string
  status: OrgCartStatus
  note: string | null
  cost_centre: string | null
  po_number: string | null
  created_by_name: string
  total: number | null
  has_delivery: boolean
  lines: Array<{
    id: string
    title: string
    subtitle: string | null
    quantity: number
    unit_price: number | null
    thumbnail: string | null
  }>
}

export type OrgInvoice = {
  order_id: string
  display_id: number | string | null
  created_at: string
  total: number
  paid: number
  balance: number
  po_number: string | null
  cost_centre: string | null
  due_at: string | null
  on_account: boolean
  status: "paid" | "outstanding" | "overdue"
  placed_by: string | null
}

type Ok<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

const base = (orgId: string) => `/store/customers/me/organisations/${encodeURIComponent(orgId)}`

async function get<T>(path: string): Promise<T | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch(path, { headers, cache: "no-store" })) as T
  } catch {
    return null
  }
}

async function send<T = Record<string, unknown>>(
  path: string,
  method: "POST" | "DELETE",
  body?: Record<string, unknown>
): Promise<Ok<{ data: T }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return { ok: false, error: "Please sign in." }
  try {
    const data = (await sdk.client.fetch(path, { method, headers, ...(body ? { body } : {}) })) as T
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "Something went wrong." }
  }
}

const plain = async (r: Promise<Ok<{ data: unknown }>>): Promise<Ok> => {
  const res = await r
  return res.ok ? { ok: true } : res
}

/* ── Account ───────────────────────────────────────────────────────────── */

export async function getOrgAccount(orgId: string, cartId?: string): Promise<OrgAccount | null> {
  return get<OrgAccount>(`${base(orgId)}/account${cartId ? `?cart_id=${encodeURIComponent(cartId)}` : ""}`)
}

export async function updateOrgApEmail(orgId: string, apEmail: string): Promise<Ok> {
  return plain(send(`${base(orgId)}/account`, "POST", { ap_email: apEmail.trim() }))
}

export async function getOrgMemberLimits(orgId: string): Promise<OrgMemberLimit[]> {
  return (await get<{ members: OrgMemberLimit[] }>(`${base(orgId)}/account/limits`))?.members ?? []
}

export async function setOrgMemberLimits(
  orgId: string,
  memberId: string,
  limits: { order_limit: number | null; monthly_limit: number | null }
): Promise<Ok> {
  return plain(send(`${base(orgId)}/account/limits`, "POST", { member_id: memberId, ...limits }))
}

export async function createOrgPurchaseOrder(
  orgId: string,
  input: { number: string; amount: number; expires_at: string | null }
): Promise<Ok> {
  return plain(send(`${base(orgId)}/purchase-orders`, "POST", input))
}

export async function setOrgPurchaseOrderActive(orgId: string, poId: string, isActive: boolean): Promise<Ok> {
  return plain(
    send(`${base(orgId)}/purchase-orders/${encodeURIComponent(poId)}`, "POST", { is_active: isActive })
  )
}

export async function createOrgCostCentre(orgId: string, input: { code: string; name: string }): Promise<Ok> {
  return plain(send(`${base(orgId)}/cost-centres`, "POST", input))
}

export async function deleteOrgCostCentre(orgId: string, ccId: string): Promise<Ok> {
  return plain(send(`${base(orgId)}/cost-centres/${encodeURIComponent(ccId)}`, "DELETE"))
}

export async function getOrgInvoices(orgId: string): Promise<OrgInvoice[]> {
  return (await get<{ invoices: OrgInvoice[] }>(`${base(orgId)}/invoices`))?.invoices ?? []
}

/* ── Checkout ──────────────────────────────────────────────────────────── */

/**
 * The organisations the signed-in customer can order for (owner or
 * purchaser), each with how the current cart may be paid. Empty for
 * everyone else, so checkout shows nothing extra to them.
 */
export async function getOrgCheckoutOptions(cartId: string): Promise<OrgAccount[]> {
  const memberships = (await listMyOrganisations()).filter(
    (m) => m.organisation && (m.role === "owner" || m.role === "purchaser")
  )
  if (!memberships.length) return []
  const accounts = await Promise.all(memberships.map((m) => getOrgAccount(m.organisation!.id, cartId)))
  return accounts.filter((a): a is OrgAccount => !!a)
}

export type OrgOrderSelection = {
  organisation_id: string | null
  cost_centre: string | null
  organisation_po_id: string | null
  /** The chosen blanket PO's number: shown as the order's PO number. */
  po_number?: string | null
}

/**
 * Tag the cart as an order for an organisation (or clear the tag). The
 * backend re-checks every part of this before the order is placed.
 */
export async function setCartOrgOrder(sel: OrgOrderSelection): Promise<Ok> {
  const cart = await retrieveCart()
  if (!cart?.id) return { ok: false, error: "Your cart has expired." }
  const current = (cart.metadata ?? {}) as Record<string, unknown>
  // "" (not a missing key) clears a value whether Medusa merges or replaces.
  const next: Record<string, unknown> = {
    ...current,
    organisation_id: sel.organisation_id ?? "",
    cost_centre: (sel.organisation_id && sel.cost_centre) || "",
    organisation_po_id: (sel.organisation_id && sel.organisation_po_id) || "",
  }
  if (sel.organisation_id && sel.organisation_po_id && sel.po_number) next.po_number = sel.po_number
  const same = ["organisation_id", "cost_centre", "organisation_po_id", "po_number"].every(
    (k) => (current[k] ?? "") === (next[k] ?? "")
  )
  if (same) return { ok: true }
  try {
    await updateCart({ metadata: next })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save your order details." }
  }
}

/**
 * Park the current cart with the organisation: a named draft a colleague can
 * finish, or an order for an owner to approve. The cart leaves this browser
 * (the cookie is cleared) and waits on the organisation page.
 */
export async function parkCartWithOrg(input: {
  organisation_id: string
  name: string
  note?: string | null
  cost_centre?: string | null
  organisation_po_id?: string | null
  send_for_approval: boolean
}): Promise<Ok> {
  const cartId = await getCartId()
  if (!cartId) return { ok: false, error: "Your cart has expired." }
  const { organisation_id, ...body } = input
  const res = await send(`${base(organisation_id)}/carts`, "POST", { cart_id: cartId, ...body })
  if (!res.ok) return res
  await removeCartId()
  updateTag("cart")
  return { ok: true }
}

/* ── Drafts + approvals ────────────────────────────────────────────────── */

export async function listOrgCarts(orgId: string): Promise<OrgCartRow[]> {
  return (await get<{ carts: OrgCartRow[] }>(`${base(orgId)}/carts`))?.carts ?? []
}

export async function getOrgCart(orgId: string, rowId: string): Promise<OrgCartDetail | null> {
  return (await get<{ cart: OrgCartDetail }>(`${base(orgId)}/carts/${encodeURIComponent(rowId)}`))?.cart ?? null
}

/** Make a draft / approved cart this browser's cart, ready for checkout. */
export async function openOrgCart(orgId: string, rowId: string): Promise<Ok> {
  const res = await send<{ cart_id?: string }>(`${base(orgId)}/carts/${encodeURIComponent(rowId)}/open`, "POST")
  if (!res.ok) return res
  if (!res.data.cart_id) return { ok: false, error: "That cart is no longer available." }
  await setCartId(res.data.cart_id)
  updateTag("cart")
  return { ok: true }
}

export async function approveOrgCart(
  orgId: string,
  rowId: string
): Promise<Ok<{ status: "ordered" | "approved"; display_id: number | string | null; message: string | null }>> {
  const res = await send<{ status: "ordered" | "approved"; display_id?: number | string | null; message?: string }>(
    `${base(orgId)}/carts/${encodeURIComponent(rowId)}/approve`,
    "POST"
  )
  if (!res.ok) return res
  return {
    ok: true,
    status: res.data.status,
    display_id: res.data.display_id ?? null,
    message: res.data.message ?? null,
  }
}

export async function declineOrgCart(orgId: string, rowId: string, reason: string): Promise<Ok> {
  return plain(send(`${base(orgId)}/carts/${encodeURIComponent(rowId)}/decline`, "POST", { reason }))
}

export async function deleteOrgCart(orgId: string, rowId: string): Promise<Ok> {
  return plain(send(`${base(orgId)}/carts/${encodeURIComponent(rowId)}`, "DELETE"))
}
