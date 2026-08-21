import type { HttpTypes } from "@medusajs/types"

export type CustomerContact = {
  email: string | null
  name: string | null
  phone: string | null
}

/** Minimal contact projection of the logged-in customer for the POA
 *  quote-request modal prefill — never pass the full StoreCustomer to a
 *  client component (it serialises addresses etc. into the HTML). */
export function toCustomerContact(
  customer: HttpTypes.StoreCustomer | null
): CustomerContact | null {
  if (!customer) return null
  return {
    email: customer.email ?? null,
    name:
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      null,
    phone: customer.phone ?? null,
  }
}
