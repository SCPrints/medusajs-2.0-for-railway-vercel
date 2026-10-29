import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { customerFillFromAddress } from "../lib/customer-fill"

/**
 * Copies the order's billing name / phone / company onto the customer's blank
 * fields. Covers website guest checkout and quote → order conversion, both of
 * which leave Medusa's auto-created customer with the email only.
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
        "customer.id",
        "customer.email",
        "customer.first_name",
        "customer.last_name",
        "customer.phone",
        "customer.company_name",
        "billing_address.first_name",
        "billing_address.last_name",
        "billing_address.phone",
        "billing_address.company",
      ],
    })
    const order = (orders as any[])?.[0]
    const customer = order?.customer
    if (!customer?.id) return

    const patch = customerFillFromAddress(customer, order.billing_address)
    if (!Object.keys(patch).length) return

    await container.resolve(Modules.CUSTOMER).updateCustomers(customer.id, patch)
    logger.info(
      `order.placed fill-customer: ${customer.id} ← ${Object.keys(patch).join(", ")} (order ${orderId})`
    )
  } catch (error) {
    logger.error(
      `order.placed fill-customer failed for order ${orderId}: ${(error as Error)?.message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
