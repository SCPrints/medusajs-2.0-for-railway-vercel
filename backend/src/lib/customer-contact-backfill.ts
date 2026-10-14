import { Modules } from "@medusajs/framework/utils"

/**
 * Contact details people type into our forms (contact form, cart quote request)
 * used to live only on the submission — the customer record stayed blank.
 * Copy them onto any existing customer with that email, but ONLY into empty
 * fields: whatever the customer or staff already set always wins. Never creates
 * a customer (most enquiries never convert).
 */
export type ContactDetails = { first_name?: string | null; last_name?: string | null; phone?: string | null }

/** Pure: which blank fields to fill. Returns null when there's nothing to do. */
export function planCustomerBlanks(current: ContactDetails, incoming: ContactDetails): ContactDetails | null {
  const patch: ContactDetails = {}
  for (const key of ["first_name", "last_name", "phone"] as const) {
    const next = incoming[key]?.trim()
    if (next && !current[key]?.trim()) patch[key] = next.slice(0, 120)
  }
  return Object.keys(patch).length ? patch : null
}

/** Best-effort — never throws, a failed backfill must not break the submission. */
export async function fillCustomerBlanks(container: any, email: string, incoming: ContactDetails): Promise<number> {
  try {
    const customers = container.resolve(Modules.CUSTOMER)
    // A guest record and a registered account can share one email — fill both.
    const matches = await customers.listCustomers({ email: email.trim().toLowerCase() })
    let updated = 0
    for (const c of matches ?? []) {
      const patch = planCustomerBlanks(c, incoming)
      if (!patch) continue
      await customers.updateCustomers(c.id, patch)
      updated++
    }
    return updated
  } catch (err) {
    console.error("Customer contact backfill failed", err)
    return 0
  }
}
