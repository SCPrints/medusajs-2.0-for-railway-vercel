/**
 * One-off catch-up for customer records, using the same rules the live code
 * now applies on every new job / order:
 *
 *   1. Jobs (quotes) with no customer get linked to the customer that owns
 *      their email (registered account first) — findCustomerIdByEmail.
 *   2. Customers with no saved address get their most recent real delivery
 *      address (no POS, organisation, pickup or studio address) as the
 *      default — customerAddressFromOrder.
 *
 * Flags:
 *   DRY_RUN=1 — prints what would change, writes nothing.
 *
 * Idempotent — re-run any time.
 *
 * Local:    cd backend && DRY_RUN=1 npx medusa exec src/scripts/backfill-customer-links.ts
 * Fly.io:   fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/backfill-customer-links.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { customerAddressFromOrder, findCustomerIdByEmail, isOwnInbox } from "../lib/customer-fill"
import { ASCOLOUR_WORKSHOP_ADDRESS_1 } from "../lib/constants"
import { QUOTE_MODULE } from "../modules/quote"

export default async function backfillCustomerLinks({ container }: ExecArgs) {
  const dryRun = process.env.DRY_RUN === "1"
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const customers = container.resolve(Modules.CUSTOMER)
  const quotes = container.resolve(QUOTE_MODULE) as any
  const tag = dryRun ? "[DRY_RUN] " : ""

  // ── 1. Jobs → customers ──────────────────────────────────────────────────
  // ponytail: full scan, fine at a few hundred quotes.
  const allQuotes: any[] = await quotes.listQuotes({}, { select: ["id", "public_id", "email", "customer_id"], take: 5000 })
  let linked = 0
  for (const q of allQuotes) {
    if (q.customer_id) continue
    const customerId = await findCustomerIdByEmail(container, q.email)
    if (!customerId) continue
    logger.info(`${tag}job ${q.public_id} (${q.email}) → ${customerId}`)
    if (!dryRun) await quotes.updateQuotes([{ id: q.id, customer_id: customerId }])
    linked++
  }

  // ── 2. Order delivery address → customer address book ───────────────────
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "created_at", "metadata", "customer.id", "customer.email", "customer.addresses.id", "shipping_address.*"],
    pagination: { order: { created_at: "DESC" }, take: 5000 },
  })
  const done = new Set<string>()
  let addresses = 0
  for (const o of orders as any[]) {
    const c = o.customer
    if (!c?.id || done.has(c.id) || c.addresses?.length || isOwnInbox(c.email)) continue
    const address = customerAddressFromOrder(o, ASCOLOUR_WORKSHOP_ADDRESS_1)
    if (!address) continue // try the customer's next-newest order
    done.add(c.id)
    logger.info(`${tag}${c.email} ← address from order #${o.display_id}: ${address.address_1}, ${address.city}`)
    if (!dryRun) {
      await customers.createCustomerAddresses({
        ...address,
        customer_id: c.id,
        is_default_shipping: true,
        is_default_billing: true,
      })
    }
    addresses++
  }

  logger.info(`${tag}backfill-customer-links: ${linked} jobs linked, ${addresses} addresses saved`)
}
