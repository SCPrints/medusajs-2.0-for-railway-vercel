/**
 * Fills a customer's BLANK name / phone / company from an order's billing
 * address. Medusa creates guest customers (website checkout, quote → order)
 * from the email alone, so the details only ever lived on the order.
 * Never overwrites a value already on the customer.
 */

type CustomerLike = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  company_name?: string | null
}

type AddressLike = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  company?: string | null
}

export type CustomerFillPatch = Partial<
  Record<"first_name" | "last_name" | "phone" | "company_name", string>
>

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "")

export function customerFillFromAddress(
  customer: CustomerLike,
  address: AddressLike | null | undefined
): CustomerFillPatch {
  if (!address) return {}
  // Our own inboxes (POS walk-in, staff test orders) are shared by many
  // people — one order's name must not stick to all of them.
  if (clean(customer.email).toLowerCase().endsWith("@scprints.com.au")) return {}

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
