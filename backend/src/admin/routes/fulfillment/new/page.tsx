import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

type Organisation = {
  id: string
  handle: string
  name: string
  contact_email: string | null
  primary_contact_customer_id: string | null
}

type Destination = {
  id: string
  name: string
  code: string | null
  address_1: string
  city: string
  province: string | null
  postal_code: string
  is_active: boolean
}

type Design = {
  id: string
  name: string
  thumbnail_url: string
  is_active: boolean
}

type InventoryRow = {
  id: string
  organisation_id: string
  product_variant_id: string
  organisation_design_id: string
  fulfillment_mode: "held_stock" | "print_on_demand"
  unit_price: number
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  reorder_point: number | null
  lead_time_days: number | null
  customer_facing_label: string | null
  is_active: boolean
  variant_title: string | null
  product_title: string | null
  design_name: string | null
  design_thumbnail_url: string | null
}

type LineDraft = {
  org_inventory_id: string
  quantity: number
}

const centsToDollars = (c: number) => (c / 100).toFixed(2)

const NewFulfillmentOrderPage = () => {
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [designs, setDesigns] = useState<Design[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [selectedDestinationId, setSelectedDestinationId] = useState<string>("")
  const [lines, setLines] = useState<LineDraft[]>([])
  const [externalRef, setExternalRef] = useState("")
  const [requestedShipBy, setRequestedShipBy] = useState("")
  const [notes, setNotes] = useState("")

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStep, setPickerStep] = useState<"design" | "garment">("design")
  const [pickerDesignId, setPickerDesignId] = useState<string>("")
  const [pickerInvId, setPickerInvId] = useState<string>("")
  const [pickerQty, setPickerQty] = useState("1")

  const [submitting, setSubmitting] = useState(false)
  const [orgLoading, setOrgLoading] = useState(false)
  const [contextLoading, setContextLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      setOrgLoading(true)
      try {
        const res = await fetch("/admin/organisations", { credentials: "include" })
        const json = (await res.json()) as { organisations?: Organisation[] }
        setOrgs(json.organisations ?? [])
      } catch {
        toast.error("Failed to load organisations")
      } finally {
        setOrgLoading(false)
      }
    })()
  }, [])

  const loadOrgContext = useCallback(async (orgId: string) => {
    setContextLoading(true)
    try {
      const [destRes, dsnRes, invRes] = await Promise.all([
        fetch(`/admin/organisations/${orgId}/destinations?active=1`, {
          credentials: "include",
        }),
        fetch(`/admin/organisations/${orgId}/designs?active=1`, {
          credentials: "include",
        }),
        fetch(`/admin/organisations/${orgId}/inventory?active=1`, {
          credentials: "include",
        }),
      ])
      const [destJson, dsnJson, invJson] = (await Promise.all([
        destRes.json(),
        dsnRes.json(),
        invRes.json(),
      ])) as [
        { destinations?: Destination[] },
        { designs?: Design[] },
        { inventory?: InventoryRow[] },
      ]
      setDestinations(destJson.destinations ?? [])
      setDesigns(dsnJson.designs ?? [])
      setInventory(invJson.inventory ?? [])
    } catch {
      toast.error("Failed to load org context")
    } finally {
      setContextLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedOrgId) {
      setDestinations([])
      setDesigns([])
      setInventory([])
      setSelectedDestinationId("")
      setLines([])
      return
    }
    void loadOrgContext(selectedOrgId)
  }, [selectedOrgId, loadOrgContext])

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === selectedOrgId) ?? null,
    [orgs, selectedOrgId]
  )

  const invById = useMemo(() => {
    const map: Record<string, InventoryRow> = {}
    for (const r of inventory) map[r.id] = r
    return map
  }, [inventory])

  const designById = useMemo(() => {
    const map: Record<string, Design> = {}
    for (const d of designs) map[d.id] = d
    return map
  }, [designs])

  const pickerInventoryForDesign = useMemo(() => {
    if (!pickerDesignId) return []
    return inventory.filter((r) => r.organisation_design_id === pickerDesignId)
  }, [inventory, pickerDesignId])

  const totalCents = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const r = invById[l.org_inventory_id]
        if (!r) return sum
        return sum + r.unit_price * l.quantity
      }, 0),
    [lines, invById]
  )

  const addLine = () => {
    if (!pickerInvId) return toast.error("Pick a garment")
    const qty = parseInt(pickerQty, 10)
    if (!isFinite(qty) || qty <= 0) {
      return toast.error("Quantity must be a positive integer")
    }
    // If a line with the same inv id exists, sum the quantities.
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.org_inventory_id === pickerInvId)
      if (idx === -1) {
        return [...prev, { org_inventory_id: pickerInvId, quantity: qty }]
      }
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        quantity: next[idx].quantity + qty,
      }
      return next
    })
    setPickerOpen(false)
    setPickerStep("design")
    setPickerDesignId("")
    setPickerInvId("")
    setPickerQty("1")
  }

  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.org_inventory_id !== id))

  const updateLineQty = (id: string, qty: string) => {
    const n = parseInt(qty, 10)
    if (!isFinite(n) || n <= 0) return
    setLines((prev) =>
      prev.map((l) =>
        l.org_inventory_id === id ? { ...l, quantity: n } : l
      )
    )
  }

  const submit = async () => {
    if (!selectedOrgId) return toast.error("Pick an organisation")
    if (!selectedDestinationId) return toast.error("Pick a destination")
    if (lines.length === 0) return toast.error("Add at least one item")
    if (!selectedOrg?.primary_contact_customer_id) {
      return toast.error(
        "Organisation has no primary_contact_customer_id. Set one on the Overview tab first."
      )
    }
    setSubmitting(true)
    try {
      const res = await fetch("/admin/fulfillment/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisation_id: selectedOrgId,
          organisation_destination_id: selectedDestinationId,
          items: lines,
          external_ref: externalRef.trim() || null,
          requested_ship_by: requestedShipBy.trim() || null,
          notes: notes.trim() || null,
          source: "manual_admin",
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as any
        throw new Error(err?.error ?? err?.message ?? `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { order_id: string }
      toast.success("Fulfillment order created")
      window.location.href = `/app/orders/${json.order_id}`
    } catch (err: any) {
      toast.error(err?.message ?? "Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  const guardMsg = !selectedOrg
    ? null
    : !selectedOrg.primary_contact_customer_id
      ? "This org has no primary_contact_customer_id. Set one on /app/organisations before placing orders."
      : null

  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4 flex items-center justify-between">
        <Heading level="h1">New fulfillment order</Heading>
        <a
          href="/app/fulfillment"
          className="text-sm text-ui-fg-interactive hover:underline"
        >
          ← Back to list
        </a>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 small:grid-cols-2 gap-4">
        <div>
          <Label size="xsmall">Organisation *</Label>
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            disabled={orgLoading}
            className="w-full rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— pick an organisation —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label size="xsmall">Destination *</Label>
          <select
            value={selectedDestinationId}
            onChange={(e) => setSelectedDestinationId(e.target.value)}
            disabled={!selectedOrgId || destinations.length === 0}
            className="w-full rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— pick a destination —</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.city}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label size="xsmall">External ref</Label>
          <Input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            placeholder="Customer's internal order number (e.g. 8517)"
          />
        </div>
        <div>
          <Label size="xsmall">Ship by</Label>
          <Input
            type="date"
            value={requestedShipBy}
            onChange={(e) => setRequestedShipBy(e.target.value)}
          />
        </div>
        <div className="small:col-span-2">
          <Label size="xsmall">Notes</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {guardMsg ? (
        <Container className="bg-ui-tag-red-bg/40 p-3 mx-6 my-3 rounded">
          <Text size="xsmall" className="text-ui-fg-base">
            {guardMsg}
          </Text>
        </Container>
      ) : null}

      <div className="px-6 py-4 flex flex-col gap-y-3">
        <div className="flex items-center justify-between">
          <Heading level="h2" className="text-base">
            Items
          </Heading>
          <Button
            size="small"
            onClick={() => setPickerOpen(true)}
            disabled={
              !selectedOrgId || contextLoading || designs.length === 0
            }
          >
            + Add item
          </Button>
        </div>

        {pickerOpen ? (
          <Container className="border border-ui-border-strong p-4 flex flex-col gap-y-3">
            <div className="flex items-center justify-between">
              <Heading level="h3" className="text-base">
                {pickerStep === "design" ? "Pick a design" : "Pick a garment"}
              </Heading>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  setPickerStep("design")
                  setPickerDesignId("")
                  setPickerInvId("")
                }}
                className="text-xs text-ui-fg-interactive hover:underline"
              >
                Cancel
              </button>
            </div>
            {pickerStep === "design" ? (
              <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-3">
                {designs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setPickerDesignId(d.id)
                      setPickerStep("garment")
                    }}
                    className="border border-ui-border-base rounded p-2 hover:border-ui-border-strong text-left"
                  >
                    <div className="aspect-square bg-ui-bg-subtle rounded overflow-hidden flex items-center justify-center mb-2">
                      <img
                        src={d.thumbnail_url}
                        alt={d.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <Text size="small" weight="plus" className="truncate">
                      {d.name}
                    </Text>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setPickerStep("design")
                    setPickerInvId("")
                  }}
                  className="text-xs text-ui-fg-interactive hover:underline text-left"
                >
                  ← back to designs
                </button>
                <div className="flex items-start gap-x-3">
                  <img
                    src={designById[pickerDesignId]?.thumbnail_url}
                    alt=""
                    className="h-16 w-16 object-contain rounded border border-ui-border-base"
                  />
                  <div>
                    <Text weight="plus">
                      {designById[pickerDesignId]?.name}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {pickerInventoryForDesign.length} garment combos
                    </Text>
                  </div>
                </div>
                {pickerInventoryForDesign.length === 0 ? (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    No active inventory rows for this design. Create one on
                    the Inventory tab first.
                  </Text>
                ) : (
                  <select
                    value={pickerInvId}
                    onChange={(e) => setPickerInvId(e.target.value)}
                    className="rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">— pick a garment + size —</option>
                    {pickerInventoryForDesign.map((r) => {
                      const label =
                        r.customer_facing_label ??
                        r.variant_title ??
                        r.product_variant_id
                      const avail =
                        r.fulfillment_mode === "held_stock"
                          ? ` · ${r.available} avail`
                          : ` · made-to-order${r.lead_time_days ? `, ${r.lead_time_days}d` : ""}`
                      return (
                        <option key={r.id} value={r.id}>
                          {label} · ${centsToDollars(r.unit_price)}
                          {avail}
                        </option>
                      )
                    })}
                  </select>
                )}
                {pickerInvId ? (
                  <div className="flex items-end gap-x-2">
                    <div>
                      <Label size="xsmall">Quantity</Label>
                      <Input
                        inputMode="numeric"
                        value={pickerQty}
                        onChange={(e) => setPickerQty(e.target.value)}
                        className="w-24"
                      />
                    </div>
                    <Button size="small" onClick={addLine}>
                      Add to order
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </Container>
        ) : null}

        {lines.length === 0 ? (
          <Container className="flex flex-col items-center gap-y-2 py-8 bg-ui-bg-subtle/40">
            <Text className="text-ui-fg-muted text-sm">No items yet.</Text>
          </Container>
        ) : (
          <Container className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Design</th>
                  <th className="px-3 py-2 text-left">Garment</th>
                  <th className="px-3 py-2 text-left">Mode</th>
                  <th className="px-3 py-2 text-right">Avail</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit $</th>
                  <th className="px-3 py-2 text-right">Line $</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const r = invById[l.org_inventory_id]
                  if (!r) return null
                  const overAllocated =
                    r.fulfillment_mode === "held_stock" &&
                    l.quantity > r.available
                  return (
                    <tr
                      key={l.org_inventory_id}
                      className="border-b border-ui-border-base"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-x-2">
                          {r.design_thumbnail_url ? (
                            <img
                              src={r.design_thumbnail_url}
                              alt=""
                              className="h-8 w-8 object-contain rounded border border-ui-border-base"
                            />
                          ) : null}
                          <span className="truncate">{r.design_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.customer_facing_label ?? r.variant_title}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          size="2xsmall"
                          color={
                            r.fulfillment_mode === "held_stock"
                              ? "green"
                              : "blue"
                          }
                        >
                          {r.fulfillment_mode === "held_stock" ? "Held" : "PoD"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {r.fulfillment_mode === "held_stock"
                          ? r.available
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          inputMode="numeric"
                          value={String(l.quantity)}
                          onChange={(e) =>
                            updateLineQty(l.org_inventory_id, e.target.value)
                          }
                          className="w-16 text-right"
                        />
                        {overAllocated ? (
                          <Text
                            size="xsmall"
                            className="text-orange-700 mt-0.5"
                          >
                            +{l.quantity - r.available} will print
                          </Text>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        ${centsToDollars(r.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ${centsToDollars(r.unit_price * l.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(l.org_inventory_id)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-ui-bg-subtle">
                  <td colSpan={6} className="px-3 py-2 text-right font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    ${centsToDollars(totalCents)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </Container>
        )}
      </div>

      <div className="px-6 py-4 flex justify-end gap-x-2">
        <a href="/app/fulfillment">
          <Button variant="secondary" size="small">
            Cancel
          </Button>
        </a>
        <Button
          size="small"
          onClick={submit}
          disabled={
            submitting ||
            !selectedOrgId ||
            !selectedDestinationId ||
            lines.length === 0 ||
            !!guardMsg
          }
        >
          {submitting ? "Submitting…" : "Submit order"}
        </Button>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "New order",
})

export default NewFulfillmentOrderPage
