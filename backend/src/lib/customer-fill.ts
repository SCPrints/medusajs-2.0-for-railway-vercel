import { Modules } from "@medusajs/framework/utils"

/**
 * Keeps the customer record filled in from what people give us elsewhere —
 * order addresses, contact / quote forms. Medusa creates guest customers
 * (website checkout, quote → order) from the email alone, so the details only
 * ever lived on the order or the submission.
 *
 * Rule everywhere: fill BLANK fields only. Whatever the customer or staff
 * already set always wins.
 */

type CustomerLike = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  company_name?: string | null
}

export type ContactLike = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  company?: string | null
}

export type CustomerFillPatch = Partial<
  Record<"first_name" | "last_name" | "phone" | "company_name", string>
>

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const normEmail = (v: unknown) => clean(v).toLowerCase()

// Our own inboxes (POS walk-in, staff test orders) are shared by many people —
// one order's name must not stick to all of them.
export const isOwnInbox = (email: unknown) => normEmail(email).endsWith("@scprints.com.au")

export function customerFillFromAddress(
  customer: CustomerLike,
  address: ContactLike | null | undefined
): CustomerFillPatch {
  if (!address) return {}
  if (isOwnInbox(customer.email)) return {}

  const patch: CustomerFillPatch = {}
  // Name is one unit: take first + last together, only when both are blank.
  if (!clean(customer.first_name) && !clean(customer.last_name)) {
    if (clean(address.first_name)) patch.first_name = clean(address.first_name)
    if (clean(address.last_name)) patch.last_name = clean(address.last_name)
  }
  if (!clean(customer.phone) && clean(address.phone)) patch.phone = clean(address.phone)
  if (!clean(customer.company_name) && clean(address.company)) {
    patch.company_name = clean(address.company)
  }
  return patch
}

type OrderLike = {
  metadata?: Record<string, unknown> | null
  shipping_address?: Record<string, any> | null
}

/**
 * Orders whose addresses are NOT the customer's own:
 *  - POS sales bill to the studio (name, phone and all) for the tax engine;
 *  - organisation fulfilment orders ship to a branch contact, not the
 *    organisation's primary contact who owns the order.
 */
export function orderAddressIsCustomers(order: OrderLike): boolean {
  const meta = order.metadata ?? {}
  return !meta.pos_session_id && !meta.fulfillment_order
}

const ADDRESS_FIELDS = [
  "first_name",
  "last_name",
  "company",
  "address_1",
  "address_2",
  "city",
  "province",
  "postal_code",
  "country_code",
  "phone",
] as const

/**
 * The order's delivery address, shaped for the customer's address book, or
 * null when it isn't a real customer address: pickup jobs, and quote
 * conversions with no address given (they carry the studio's geo so the tax
 * engine computes GST — matched by `studioAddress1`).
 */
export function customerAddressFromOrder(
  order: OrderLike,
  studioAddress1: string | null | undefined
): Record<string, string> | null {
  if (!orderAddressIsCustomers(order)) return null
  if (order.metadata?.delivery_method === "pickup") return null
  const a = order.shipping_address
  if (!a || !clean(a.address_1) || !clean(a.city)) return null
  if (clean(studioAddress1) && clean(a.address_1).toLowerCase() === clean(studioAddress1).toLowerCase()) {
    return null
  }
  const out: Record<string, string> = {}
  for (const k of ADDRESS_FIELDS) if (clean(a[k])) out[k] = clean(a[k])
  if (out.country_code) out.country_code = out.country_code.toLowerCase()
  return out
}

/**
 * The customer that owns this email: a registered account beats a guest
 * record (Medusa keeps one of each when an account holder also checked out
 * as a guest). Null when there is none — never creates one, most enquiries
 * never convert. Best-effort: lookup failures return null.
 */
export async function findCustomerIdByEmail(container: any, email: unknown): Promise<string | null> {
  const e = normEmail(email)
  if (!e || isOwnInbox(e)) return null
  try {
    const matches: any[] = await container.resolve(Modules.CUSTOMER).listCustomers({ email: e })
    const pick = matches.find((c) => c?.has_account) ?? matches[0]
    return pick?.id ?? null
  } catch {
    return null
  }
}

/**
 * Copy contact details from a form submission onto every customer with that
 * email (a guest record and a registered account can share one), blanks only.
 * Never throws — a failed fill must not break the submission.
 */
export async function fillCustomerBlanks(container: any, email: unknown, incoming: ContactLike): Promise<number> {
  const e = normEmail(email)
  if (!e) return 0
  try {
    const customers = container.resolve(Modules.CUSTOMER)
    const matches: any[] = await customers.listCustomers({ email: e })
    let updated = 0
    for (const c of matches ?? []) {
      const patch = customerFillFromAddress(c, incoming)
      if (!Object.keys(patch).length) continue
      await customers.updateCustomers(c.id, patch)
      updated++
    }
    return updated
  } catch (err) {
    console.error("Customer contact fill failed", err)
    return 0
  }
}
