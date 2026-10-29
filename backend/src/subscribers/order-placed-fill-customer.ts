import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import {
  customerAddressFromOrder,
  customerFillFromAddress,
  isOwnInbox,
  orderAddressIsCustomers,
} from "../lib/customer-fill"
import { ASCOLOUR_WORKSHOP_ADDRESS_1 } from "../lib/constants"

/**
 * Copies the order's billing name / phone / company onto the customer's blank
 * fields, and saves the delivery address to the customer's address book when
 * they have none. Covers website guest checkout and quote → order conversion,
 * both of which leave Medusa's auto-created customer with the email only.
 * POS and organisation orders are skipped (their addresses aren't the
 * customer's — see orderAddressIsCustomers).
 *
 * Idempotent: only fills blanks. Never throws — a failure here must not
 * affect the order.
 */
export default async function orderPlacedFillCustomerHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: [
        "metadata",
        "customer.id",
        "customer.email",
        "customer.first_name",
        "customer.last_name",
        "customer.phone",
        "customer.company_name",
        "customer.addresses.id",
        "billing_address.first_name",
        "billing_address.last_name",
        "billing_address.phone",
        "billing_address.company",
        "shipping_address.*",
      ],
    })
    const order = (orders as any[])?.[0]
    const customer = order?.customer
    if (!customer?.id || !orderAddressIsCustomers(order)) return
    const customers = container.resolve(Modules.CUSTOMER)

    const patch = customerFillFromAddress(customer, order.billing_address)
    if (Object.keys(patch).length) {
      await customers.updateCustomers(customer.id, patch)
      logger.info(
        `order.placed fill-customer: ${customer.id} ← ${Object.keys(patch).join(", ")} (order ${orderId})`
      )
    }

    // Address book: first real delivery address becomes the default, so the
    // next quote → order for this customer bills/ships to it.
    const address = customer.addresses?.length
      ? null
      : customerAddressFromOrder(order, ASCOLOUR_WORKSHOP_ADDRESS_1)
    if (address && !isOwnInbox(customer.email)) {
      await customers.createCustomerAddresses({
        ...address,
        customer_id: customer.id,
        is_default_shipping: true,
        is_default_billing: true,
      })
      logger.info(`order.placed fill-customer: ${customer.id} ← address (order ${orderId})`)
    }
  } catch (error) {
    logger.error(
      `order.placed fill-customer failed for order ${orderId}: ${(error as Error)?.message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
