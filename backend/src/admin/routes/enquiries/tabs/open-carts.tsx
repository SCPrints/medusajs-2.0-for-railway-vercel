import { Container, Heading, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { HelpTooltip } from "../../../components/reports/help-tooltip"
import { OpenCartsList } from "../../../components/open-carts/open-carts-list"

const OpenCartsPage = () => {
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "")
  const [q, setQ] = useState(input)

  // Debounce + keep ?q= shareable (the enquiry email links here).
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim())
      const url = new URL(window.location.href)
      input.trim() ? url.searchParams.set("q", input.trim()) : url.searchParams.delete("q")
      window.history.replaceState(null, "", url)
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

export default OpenCartsPage
