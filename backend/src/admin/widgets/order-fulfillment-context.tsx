import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { withWidgetBoundary } from "../components/widget-error-boundary"
import { HelpTooltip } from "../components/reports/help-tooltip"

type Organisation = {
  id: string
  name: string
  handle: string
  contact_email: string | null
  primary_contact_customer_id: string | null
}

type Destination = {
  id: string
  name: string
  code: string | null
  address_1: string
  address_2: string | null
  city: string
  province: string | null
  postal_code: string
  country_code: string
  delivery_notes: string | null
}

type Design = {
  id: string
  name: string
  thumbnail_url: string
}

type FulfillmentLineSummary = {
  line_id: string
  title: string
  quantity: number
  fulfillment_mode: "held_stock" | "print_on_demand" | null
  org_inventory_id: string | null
  organisation_design_id: string | null
  design_name: string | null
  design_thumbnail_url: string | null
}

/**
 * Fulfillment context widget — renders below the order header for
 * orders tagged metadata.fulfillment_order = true. Shows the org,
 * destination, external_ref, source, the designs used, and the line
 * summary with stock movement context.
 *
 * Hidden entirely for non-fulfillment orders so regular Medusa order
 * detail pages stay unchanged.
 */
const OrderFulfillmentContextWidget = ({
  data: order,
}: DetailWidgetProps<AdminOrder>) => {
  const meta = ((order as any)?.metadata ?? {}) as Record<string, any>
  const isFulfillment = meta.fulfillment_order === true

  const [organisation, setOrganisation] = useState<Organisation | null>(null)
  const [destination, setDestination] = useState<Destination | null>(null)
  const [designs, setDesigns] = useState<Record<string, Design>>({})
  const [loading, setLoading] = useState(false)

  const orgId: string | null = meta.organisation_id ?? null
  const destId: string | null = meta.organisation_destination_id ?? null

  const load = useCallback(async () => {
    if (!isFulfillment || !orgId) return
    setLoading(true)
    try {
      const [orgRes, destRes, dsnRes] = await Promise.all([
        fetch(`/admin/organisations/${orgId}`, { credentials: "include" }),
        destId
          ? fetch(
              `/admin/organisations/${orgId}/destinations/${destId}`,
              { credentials: "include" }
            )
          : Promise.resolve(null),
        fetch(`/admin/organisations/${orgId}/designs?active=1`, {
          credentials: "include",
        }),
      ])

      if (orgRes.ok) {
        const orgJson = (await orgRes.json()) as { organisation?: Organisation }
        setOrganisation(orgJson.organisation ?? null)
      }
      if (destRes && destRes.ok) {
        const destJson = (await destRes.json()) as { destination?: Destination }
        setDestination(destJson.destination ?? null)
      }
      if (dsnRes.ok) {
        const dsnJson = (await dsnRes.json()) as { designs?: Design[] }
        const map: Record<string, Design> = {}
        for (const d of dsnJson.designs ?? []) map[d.id] = d
        setDesigns(map)
      }
    } finally {
      setLoading(false)
    }
  }, [isFulfillment, orgId, destId])

  useEffect(() => {
    void load()
  }, [load])

  if (!isFulfillment) return null

  const items = ((order as any).items ?? []) as any[]
  const fulfillmentLines: FulfillmentLineSummary[] = items
    .map((it) => {
      const lm = (it.metadata ?? {}) as Record<string, any>
      if (!lm.fulfillment_line) return null
      const designId = (lm.organisation_design_id as string | null) ?? null
      const design = designId ? designs[designId] : null
      return {
        line_id: it.id,
        title: it.title ?? "(no title)",
        quantity: Number(it.quantity ?? 0),
        fulfillment_mode:
          (lm.fulfillment_mode as "held_stock" | "print_on_demand") ?? null,
        org_inventory_id: (lm.org_inventory_id as string) ?? null,
        organisation_design_id: designId,
        design_name: design?.name ?? null,
        design_thumbnail_url: design?.thumbnail_url ?? null,
      }
    })
    .filter((x): x is FulfillmentLineSummary => x != null)

  const uniqueDesigns = Array.from(
    new Set(
      fulfillmentLines
        .map((l) => l.organisation_design_id)
        .filter((x): x is string => !!x)
    )
  )
    .map((id) => designs[id])
    .filter((d): d is Design => !!d)

  const externalRef = meta.external_ref as string | null
  const source = (meta.source as string | null) ?? "manual_admin"
  const requestedShipBy = meta.requested_ship_by as string | null
  const notes = meta.notes as string | null
  const placedByAdmin = meta.placed_by_admin_user_id as string | null
  const placedByCustomer = meta.placed_by_customer_id as string | null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2" className="flex items-center">
          Fulfillment Context
          <HelpTooltip
            text={{
              title: "Fulfillment context",
              body: "This order was placed against an organisation's pre-approved stock — not a regular D2C purchase. Customer pays via standing arrangement.",
              bullets: [
                "Stock is decremented automatically on order placement (held_stock lines) and on shipment.",
                "Print-on-demand lines auto-create unassigned tasks in /app/tasks.",
                "External ref is the customer's internal order number.",
              ],
            }}
          />
        </Heading>
        <Badge color="blue" size="small">
          {source}
        </Badge>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 small:grid-cols-2 gap-3 text-sm">
        <div>
          <Text size="xsmall" className="text-ui-fg-muted">
            Organisation
          </Text>
          <Text>
            {organisation ? (
              <a
                href="/app/organisations"
                className="text-ui-fg-interactive hover:underline"
              >
                {organisation.name}
              </a>
            ) : (
              orgId ?? "—"
            )}
          </Text>
        </div>
        <div>
          <Text size="xsmall" className="text-ui-fg-muted">
            Destination
          </Text>
          <Text>
            {destination ? (
              <>
                {destination.name}
                <br />
                <span className="text-xs text-ui-fg-subtle">
                  {destination.address_1}, {destination.city}
                  {destination.province ? `, ${destination.province}` : ""}{" "}
                  {destination.postal_code}
                </span>
                {destination.delivery_notes ? (
                  <>
                    <br />
                    <span className="text-xs text-ui-fg-muted italic">
                      {destination.delivery_notes}
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              destId ?? "—"
            )}
          </Text>
        </div>
        <div>
          <Text size="xsmall" className="text-ui-fg-muted">
            External ref
          </Text>
          <Text className="font-mono">{externalRef ?? "—"}</Text>
        </div>
        <div>
          <Text size="xsmall" className="text-ui-fg-muted">
            Requested ship by
          </Text>
          <Text>{requestedShipBy ?? "—"}</Text>
        </div>
        {placedByAdmin ? (
          <div>
            <Text size="xsmall" className="text-ui-fg-muted">
              Placed by (admin)
            </Text>
            <Text className="font-mono text-xs">{placedByAdmin}</Text>
          </div>
        ) : null}
        {placedByCustomer ? (
          <div>
            <Text size="xsmall" className="text-ui-fg-muted">
              Placed by (customer)
            </Text>
            <Text className="font-mono text-xs">{placedByCustomer}</Text>
          </div>
        ) : null}
        {notes ? (
          <div className="small:col-span-2">
            <Text size="xsmall" className="text-ui-fg-muted">
              Notes
            </Text>
            <Text className="whitespace-pre-wrap">{notes}</Text>
          </div>
        ) : null}
      </div>

      {uniqueDesigns.length > 0 ? (
        <div className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-muted mb-2">
            Designs in this order
          </Text>
          <div className="flex flex-wrap gap-2">
            {uniqueDesigns.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-x-2 border border-ui-border-base rounded px-2 py-1"
              >
                <img
                  src={d.thumbnail_url}
                  alt=""
                  className="h-8 w-8 object-contain rounded"
                />
                <Text size="small">{d.name}</Text>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {fulfillmentLines.length > 0 ? (
        <div className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-muted mb-2">
            Fulfillment lines ({fulfillmentLines.length})
          </Text>
          <ul className="divide-y text-sm">
            {fulfillmentLines.map((l) => (
              <li
                key={l.line_id}
                className="py-2 flex items-center gap-x-3"
              >
                {l.design_thumbnail_url ? (
                  <img
                    src={l.design_thumbnail_url}
                    alt=""
                    className="h-8 w-8 object-contain rounded border border-ui-border-base shrink-0"
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <Text className="truncate">{l.title}</Text>
                  {l.org_inventory_id ? (
                    <Text
                      size="xsmall"
                      className="text-ui-fg-muted font-mono truncate"
                    >
                      {l.org_inventory_id}
                    </Text>
                  ) : null}
                </div>
                <Badge
                  size="2xsmall"
                  color={
                    l.fulfillment_mode === "held_stock" ? "green" : "blue"
                  }
                >
                  {l.fulfillment_mode === "held_stock"
                    ? "Held"
                    : l.fulfillment_mode === "print_on_demand"
                      ? "PoD"
                      : "?"}
                </Badge>
                <span className="font-mono text-sm w-12 text-right">
                  ×{l.quantity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <Text size="xsmall" className="text-ui-fg-muted px-6 py-2">
          Loading context…
        </Text>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default withWidgetBoundary(
  OrderFulfillmentContextWidget,
  "order-fulfillment-context"
)
