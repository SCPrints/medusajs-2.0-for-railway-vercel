import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Text,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"

type FulfillmentOrder = {
  id: string
  display_id: number | string
  email: string | null
  total: number
  currency_code: string
  status: string
  created_at: string
  metadata: Record<string, any>
}

const fmtDate = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "—"
}

const FulfillmentOrdersPage = () => {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/fulfillment/orders", {
        credentials: "include",
      })
      if (!res.ok) throw new Error(await res.text())
      const json = (await res.json()) as { orders?: FulfillmentOrder[] }
      setOrders(json.orders ?? [])
    } catch (err: any) {
      setError(err?.message ?? "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1" className="flex items-center">
          Fulfillment Orders
          <HelpTooltip
            text={{
              title: "Fulfillment orders",
              body: "Orders placed against an organisation's pre-approved stock. These are not regular D2C purchases — customer pays via standing arrangement, not per-order.",
              bullets: [
                "Use 'New Order' to enter an order received by email from a customer like Lifegrain Cafe.",
                "Stock is decremented automatically when the order is placed (held_stock lines) and on shipment.",
                "Print-on-demand lines auto-create unassigned tasks in /app/tasks.",
                "See Docs/FULFILLMENT_PHASE_1_SPEC.md for the full workflow.",
              ],
            }}
          />
        </Heading>
        <div className="flex items-center gap-x-2">
          <Badge color="blue">{orders.length}</Badge>
          <Button size="small" variant="secondary" onClick={load}>
            Refresh
          </Button>
          <a href="/app/fulfillment/new">
            <Button size="small">+ New order</Button>
          </a>
        </div>
      </div>

      {error ? (
        <Container>
          <Text className="text-ui-tag-red-icon p-4">{error}</Text>
        </Container>
      ) : null}

      {loading ? (
        <Text className="text-ui-fg-muted p-6 text-sm">Loading…</Text>
      ) : orders.length === 0 ? (
        <Container className="flex flex-col items-center gap-y-2 py-12">
          <Text className="text-ui-fg-muted text-sm">
            No fulfillment orders yet.
          </Text>
          <a href="/app/fulfillment/new">
            <Button size="small">+ Place first order</Button>
          </a>
        </Container>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Order</th>
                <th className="px-4 py-2 text-left">External</th>
                <th className="px-4 py-2 text-left">Org</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Stage</th>
                <th className="px-4 py-2 text-left">Placed</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const stage =
                  (o.metadata?.production_stage as string | undefined) ??
                  "received"
                return (
                  <tr
                    key={o.id}
                    className="border-b border-ui-border-base hover:bg-ui-bg-subtle/30 transition"
                  >
                    <td className="px-4 py-2">
                      <a
                        href={`/app/orders/${o.id}`}
                        className="text-ui-fg-interactive hover:underline"
                      >
                        #{o.display_id}
                      </a>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {(o.metadata?.external_ref as string) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {(o.metadata?.organisation_id as string) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <Badge size="2xsmall" color="grey">
                        {(o.metadata?.source as string) ?? "manual_admin"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge size="2xsmall" color="blue">
                        {stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-ui-fg-subtle">
                      {fmtDate(o.created_at)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      ${(o.total ?? 0).toFixed(2)} {o.currency_code?.toUpperCase()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Fulfillment",
  icon: ShoppingBag,
})

export default FulfillmentOrdersPage
