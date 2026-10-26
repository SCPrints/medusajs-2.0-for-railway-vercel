import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingCart } from "@medusajs/icons"
import { Container, Heading, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import { OpenCartsList } from "../../components/open-carts/open-carts-list"

/**
 * Carts people built (often with Studio designs) but never checked out. Not a
 * job until the customer asks ("Email me a quote") or staff convert it, so it
 * lives under Customers rather than in the Jobs list. Was the Enquiries page's
 * second tab until 2026-10-27.
 */
const OpenCartsPage = () => {
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "")
  const [q, setQ] = useState(input)

  // Debounce + keep ?q= shareable (the enquiry email links here).
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim())
      const url = new URL(window.location.href)
      input.trim() ? url.searchParams.set("q", input.trim()) : url.searchParams.delete("q")
      window.history.replaceState(window.history.state, "", url) // keep the router's entry state
    }, 300)
    return () => clearTimeout(t)
  }, [input])

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <Heading level="h1">Open carts</Heading>
        <HelpTooltip text="Carts that haven't been checked out yet, with the customer's designs and artwork files. Search by email, name, cart ID (cart_…) or line ID (cali_…). Convert to quote to send a proof and payment link." />
      </div>
      <Input
        placeholder="Email, name, cart_… or cali_…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {!q ? (
        <Text size="small" className="text-ui-fg-muted">Most recently active carts with an email (last 90 days).</Text>
      ) : null}
      <OpenCartsList q={q} emptyText="No open carts match." />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Open carts",
  icon: ShoppingCart,
  nested: "/customers",
  rank: 55,
})

export default OpenCartsPage
