import { Metadata } from "next"
import Overview from "@modules/account/components/overview"
import { notFound } from "next/navigation"
import { getCustomer } from "@lib/data/customer"
import { listOrders } from "@lib/data/orders"
import { getCustomerTier } from "@lib/data/customer-tier"

export const metadata: Metadata = {
  title: "Account",
  description: "Overview of your account activity.",
}

export default async function OverviewTemplate(){const [customer, orders, tier] = await Promise.all([
    getCustomer().catch(() => null),
    listOrders().catch(() => null),
    getCustomerTier().catch(() => null),
  ])

  if (!customer) {
    notFound()
  }

  return <Overview customer={customer} orders={orders ?? null} tier={tier} />
}
