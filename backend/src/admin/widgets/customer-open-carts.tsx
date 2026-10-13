import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading } from "@medusajs/ui"
import { useState } from "react"

import { OpenCartsList } from "../components/open-carts/open-carts-list"
import { withWidgetBoundary } from "../components/widget-error-boundary"

/** The customer's unfinished carts (designs + artwork). Hidden when there are none. */
const CustomerOpenCartsWidget = ({ data: customer }: { data: { id: string } }) => {
  const [count, setCount] = useState<number | null>(null)
  if (!customer?.id) return null

  return (
    <Container className={count === 0 ? "hidden" : "flex flex-col gap-3 p-6"}>
      <Heading level="h2">Open carts</Heading>
      <OpenCartsList q={customer.id} onLoaded={setCount} />
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default withWidgetBoundary(CustomerOpenCartsWidget, "customer-open-carts")
