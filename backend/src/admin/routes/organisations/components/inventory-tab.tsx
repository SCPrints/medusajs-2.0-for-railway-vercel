import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

type FulfillmentMode = "held_stock" | "print_on_demand"

type InventoryRow = {
  id: string
  organisation_id: string
  product_variant_id: string
  organisation_design_id: string
  fulfillment_mode: FulfillmentMode
  unit_price: number
  unit_cost: number
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  reorder_point: number | null
  reorder_quantity: number | null
  lead_time_days: number | null
  customer_facing_label: string | null
  is_active: boolean
  variant_title: string | null
  product_title: string | null
  design_name: string | null
  design_thumbnail_url: string | null
}

type DesignLite = {
  id: string
  name: string
  thumbnail_url: string
  is_active: boolean
}

type Movement = {
  id: string
  qty_delta: number
  reason: string
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

type EditorState = {
  open: boolean
  editingId: string | null
  designId: string
  variantId: string
  mode: FulfillmentMode
  unitPriceDollars: string
  unitCostDollars: string
  reorderPoint: string
  reorderQuantity: string
  leadTimeDays: string
  customerLabel: string
  isActive: boolean
  initialQuantity: string
  saving: boolean
}

const emptyEditor = (): EditorState => ({
  open: false,
  editingId: null,
  designId: "",
  variantId: "",
  mode: "held_stock",
  unitPriceDollars: "",
  unitCostDollars: "",
  reorderPoint: "",
  reorderQuantity: "",
  leadTimeDays: "",
  customerLabel: "",
  isActive: true,
  initialQuantity: "",
  saving: false,
})

const dollarsToCents = (v: string): number => {
  const n = parseFloat(v)
  if (!isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

const centsToDollars = (c: number): string => (c / 100).toFixed(2)

const formatMoney = (cents: number) => `$${centsToDollars(cents)}`

type Props = {
  organisationId: string
  onCountChange?: (count: number) => void
}

const InventoryTab = ({ organisationId, onCountChange }: Props) => {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [designs, setDesigns] = useState<DesignLite[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [designFilter, setDesignFilter] = useState<string>("")
  const [modeFilter, setModeFilter] = useState<string>("")
  const [belowReorderOnly, setBelowReorderOnly] = useState(false)
  const [editor, setEditor] = useState<EditorState>(emptyEditor())
  const [movementsFor, setMovementsFor] = useState<{
    rowId: string
    rowLabel: string
    movements: Movement[]
    loading: boolean
  } | null>(null)
  const [actionFor, setActionFor] = useState<{
    rowId: string
    rowLabel: string
    kind: "adjust" | "receive"
    quantity: string
    notes: string
    saving: boolean
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.set("active", "1")
      if (designFilter) params.set("design_id", designFilter)
      if (modeFilter) params.set("mode", modeFilter)
      if (belowReorderOnly) params.set("below_reorder", "1")
      const res = await fetch(
        `/admin/organisations/${organisationId}/inventory?${params.toString()}`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(await res.text())
      const json = (await res.json()) as { inventory?: InventoryRow[] }
      const list = json.inventory ?? []
      setRows(list)
      onCountChange?.(list.filter((r) => r.is_active).length)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }, [
    organisationId,
    showInactive,
    designFilter,
    modeFilter,
    belowReorderOnly,
    onCountChange,
  ])

  const loadDesigns = useCallback(async () => {
    try {
      const res = await fetch(
        `/admin/organisations/${organisationId}/designs?active=1`,
        { credentials: "include" }
      )
      const json = (await res.json()) as { designs?: DesignLite[] }
      setDesigns(json.designs ?? [])
    } catch {
      /* non-fatal — picker just shows empty */
    }
  }, [organisationId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadDesigns()
  }, [loadDesigns])

  const openCreate = () => setEditor({ ...emptyEditor(), open: true })

  const openEdit = (r: InventoryRow) =>
    setEditor({
      open: true,
      editingId: r.id,
      designId: r.organisation_design_id,
      variantId: r.product_variant_id,
      mode: r.fulfillment_mode,
      unitPriceDollars: centsToDollars(r.unit_price),
      unitCostDollars: centsToDollars(r.unit_cost),
      reorderPoint: r.reorder_point == null ? "" : String(r.reorder_point),
      reorderQuantity:
        r.reorder_quantity == null ? "" : String(r.reorder_quantity),
      leadTimeDays:
        r.lead_time_days == null ? "" : String(r.lead_time_days),
      customerLabel: r.customer_facing_label ?? "",
      isActive: r.is_active,
      initialQuantity: "",
      saving: false,
    })

  const closeEditor = () => setEditor(emptyEditor())

  const submitEditor = async () => {
    if (!editor.editingId) {
      if (!editor.designId) return toast.error("Pick a design")
      if (!editor.variantId.trim())
        return toast.error("Paste a product variant ID")
    }
    if (!editor.unitPriceDollars || !editor.unitCostDollars) {
      return toast.error("Unit price + unit cost required")
    }
    setEditor((s) => ({ ...s, saving: true }))

    const intOrNull = (v: string) => {
      if (!v.trim()) return null
      const n = parseInt(v, 10)
      return isFinite(n) ? n : null
    }

    if (editor.editingId) {
      // UPDATE
      const body = {
        fulfillment_mode: editor.mode,
        unit_price: dollarsToCents(editor.unitPriceDollars),
        unit_cost: dollarsToCents(editor.unitCostDollars),
        reorder_point: intOrNull(editor.reorderPoint),
        reorder_quantity: intOrNull(editor.reorderQuantity),
        lead_time_days: intOrNull(editor.leadTimeDays),
        customer_facing_label: editor.customerLabel.trim() || null,
        is_active: editor.isActive,
      }
      try {
        const res = await fetch(
          `/admin/organisations/${organisationId}/inventory/${editor.editingId}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )
        if (!res.ok) throw new Error(await res.text())
        toast.success("Inventory row updated")
        closeEditor()
        await load()
      } catch (err: any) {
        toast.error(err?.message ?? "Save failed")
        setEditor((s) => ({ ...s, saving: false }))
      }
    } else {
      // CREATE
      const body: Record<string, unknown> = {
        product_variant_id: editor.variantId.trim(),
        organisation_design_id: editor.designId,
        fulfillment_mode: editor.mode,
        unit_price: dollarsToCents(editor.unitPriceDollars),
        unit_cost: dollarsToCents(editor.unitCostDollars),
        reorder_point: intOrNull(editor.reorderPoint),
        reorder_quantity: intOrNull(editor.reorderQuantity),
        lead_time_days: intOrNull(editor.leadTimeDays),
        customer_facing_label: editor.customerLabel.trim() || null,
        is_active: editor.isActive,
      }
      const initial = intOrNull(editor.initialQuantity)
      if (initial && initial > 0) body.initial_quantity = initial

      try {
        const res = await fetch(
          `/admin/organisations/${organisationId}/inventory`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )
        if (!res.ok) throw new Error(await res.text())
        toast.success("Inventory row created")
        closeEditor()
        await load()
      } catch (err: any) {
        toast.error(err?.message ?? "Create failed")
        setEditor((s) => ({ ...s, saving: false }))
      }
    }
  }

  const openMovements = async (r: InventoryRow) => {
    const label = `${r.design_name ?? r.organisation_design_id} × ${r.variant_title ?? r.product_variant_id}`
    setMovementsFor({ rowId: r.id, rowLabel: label, movements: [], loading: true })
    try {
      const res = await fetch(
        `/admin/organisations/${organisationId}/inventory/${r.id}/movements`,
        { credentials: "include" }
      )
      const json = (await res.json()) as { movements?: Movement[] }
      setMovementsFor((m) =>
        m && m.rowId === r.id
          ? { ...m, movements: json.movements ?? [], loading: false }
          : m
      )
    } catch {
      setMovementsFor((m) => (m ? { ...m, loading: false } : m))
      toast.error("Failed to load movements")
    }
  }

  const closeMovements = () => setMovementsFor(null)

  const openAction = (r: InventoryRow, kind: "adjust" | "receive") => {
    const label = `${r.design_name ?? r.organisation_design_id} × ${r.variant_title ?? r.product_variant_id}`
    setActionFor({
      rowId: r.id,
      rowLabel: label,
      kind,
      quantity: kind === "adjust" ? String(r.quantity_on_hand) : "",
      notes: "",
      saving: false,
    })
  }

  const submitAction = async () => {
    if (!actionFor) return
    const qty = parseInt(actionFor.quantity, 10)
    if (!isFinite(qty) || qty < 0) {
      toast.error("Quantity must be a non-negative integer")
      return
    }
    if (actionFor.kind === "receive" && qty === 0) {
      toast.error("Receive quantity must be > 0")
      return
    }
    setActionFor((s) => (s ? { ...s, saving: true } : s))

    const url =
      actionFor.kind === "adjust"
        ? `/admin/organisations/${organisationId}/inventory/${actionFor.rowId}/adjust`
        : `/admin/organisations/${organisationId}/inventory/${actionFor.rowId}/receive`
    const body =
      actionFor.kind === "adjust"
        ? { target_quantity: qty, notes: actionFor.notes || null }
        : { quantity: qty, notes: actionFor.notes || null }

    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(actionFor.kind === "adjust" ? "Stocktake recorded" : "Receipt recorded")
      setActionFor(null)
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Action failed")
      setActionFor((s) => (s ? { ...s, saving: false } : s))
    }
  }

  const visibleRows = useMemo(() => rows, [rows])

  const belowReorderCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.is_active &&
          r.fulfillment_mode === "held_stock" &&
          r.reorder_point != null &&
          r.available <= r.reorder_point
      ).length,
    [rows]
  )

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Text size="small" className="text-ui-fg-subtle">
          Inventory rows pair each design with a product variant. The triple
          (org, variant, design) is the orderable SKU.
        </Text>
        <div className="flex items-center gap-x-2 flex-wrap">
          <Switch
            id="show-inactive-inv"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-inv" size="xsmall">
            Inactive
          </Label>
          <Switch
            id="below-reorder-inv"
            checked={belowReorderOnly}
            onCheckedChange={setBelowReorderOnly}
          />
          <Label htmlFor="below-reorder-inv" size="xsmall">
            Below reorder ({belowReorderCount})
          </Label>
          <select
            value={designFilter}
            onChange={(e) => setDesignFilter(e.target.value)}
            className="rounded-md border border-ui-border-base bg-white px-2 py-1 text-xs"
          >
            <option value="">All designs</option>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="rounded-md border border-ui-border-base bg-white px-2 py-1 text-xs"
          >
            <option value="">All modes</option>
            <option value="held_stock">Held stock</option>
            <option value="print_on_demand">Print-on-demand</option>
          </select>
          <Button size="small" onClick={openCreate} disabled={designs.length === 0}>
            + Add SKU
          </Button>
        </div>
      </div>
      {designs.length === 0 ? (
        <Container className="bg-ui-tag-orange-bg/40 p-3">
          <Text size="xsmall" className="text-ui-fg-base">
            Add at least one design on the Designs tab before creating inventory
            rows.
          </Text>
        </Container>
      ) : null}

      {editor.open ? (
        <Container className="border border-ui-border-base p-4 flex flex-col gap-y-3">
          <Heading level="h3" className="text-base">
            {editor.editingId ? "Edit inventory row" : "New inventory row"}
          </Heading>
          {!editor.editingId ? (
            <>
              <div>
                <Label size="xsmall">Design *</Label>
                <select
                  value={editor.designId}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, designId: e.target.value }))
                  }
                  className="w-full rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">— pick a design —</option>
                  {designs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label size="xsmall">Product variant ID *</Label>
                <Input
                  value={editor.variantId}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, variantId: e.target.value }))
                  }
                  placeholder="variant_01H… (paste from product detail)"
                />
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  Find this on the product detail page in admin. The variant
                  must exist in the catalog; this row reuses it.
                </Text>
              </div>
            </>
          ) : null}
          <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
            <div>
              <Label size="xsmall">Fulfillment mode *</Label>
              <select
                value={editor.mode}
                onChange={(e) =>
                  setEditor((s) => ({
                    ...s,
                    mode: e.target.value as FulfillmentMode,
                  }))
                }
                className="w-full rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm"
              >
                <option value="held_stock">Held stock</option>
                <option value="print_on_demand">Print-on-demand</option>
              </select>
            </div>
            <div>
              <Label size="xsmall">Customer-facing label</Label>
              <Input
                value={editor.customerLabel}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, customerLabel: e.target.value }))
                }
                placeholder="Defaults to variant title"
              />
            </div>
            <div>
              <Label size="xsmall">Unit price ($) *</Label>
              <Input
                inputMode="decimal"
                value={editor.unitPriceDollars}
                onChange={(e) =>
                  setEditor((s) => ({
                    ...s,
                    unitPriceDollars: e.target.value,
                  }))
                }
                placeholder="14.00"
              />
            </div>
            <div>
              <Label size="xsmall">Unit cost ($) *</Label>
              <Input
                inputMode="decimal"
                value={editor.unitCostDollars}
                onChange={(e) =>
                  setEditor((s) => ({
                    ...s,
                    unitCostDollars: e.target.value,
                  }))
                }
                placeholder="6.50"
              />
            </div>
            {editor.mode === "held_stock" ? (
              <>
                <div>
                  <Label size="xsmall">Reorder point</Label>
                  <Input
                    inputMode="numeric"
                    value={editor.reorderPoint}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        reorderPoint: e.target.value,
                      }))
                    }
                    placeholder="10"
                  />
                </div>
                <div>
                  <Label size="xsmall">Reorder quantity</Label>
                  <Input
                    inputMode="numeric"
                    value={editor.reorderQuantity}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        reorderQuantity: e.target.value,
                      }))
                    }
                    placeholder="60"
                  />
                </div>
              </>
            ) : (
              <div className="small:col-span-2">
                <Label size="xsmall">Lead time (days)</Label>
                <Input
                  inputMode="numeric"
                  value={editor.leadTimeDays}
                  onChange={(e) =>
                    setEditor((s) => ({
                      ...s,
                      leadTimeDays: e.target.value,
                    }))
                  }
                  placeholder="5"
                />
              </div>
            )}
            {!editor.editingId && editor.mode === "held_stock" ? (
              <div className="small:col-span-2">
                <Label size="xsmall">Initial on-hand quantity</Label>
                <Input
                  inputMode="numeric"
                  value={editor.initialQuantity}
                  onChange={(e) =>
                    setEditor((s) => ({
                      ...s,
                      initialQuantity: e.target.value,
                    }))
                  }
                  placeholder="0 (writes an adjustment_up movement)"
                />
              </div>
            ) : null}
            <div className="flex items-end gap-x-2 small:col-span-2">
              <Switch
                id="inv-active"
                checked={editor.isActive}
                onCheckedChange={(v) =>
                  setEditor((s) => ({ ...s, isActive: v }))
                }
              />
              <Label htmlFor="inv-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-x-2">
            <Button
              size="small"
              variant="secondary"
              onClick={closeEditor}
              disabled={editor.saving}
            >
              Cancel
            </Button>
            <Button
              size="small"
              onClick={submitEditor}
              disabled={editor.saving}
            >
              {editor.saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Container>
      ) : null}

      {movementsFor ? (
        <Container className="border border-ui-border-strong p-4 flex flex-col gap-y-2">
          <div className="flex items-center justify-between">
            <Heading level="h3" className="text-base">
              Movements · {movementsFor.rowLabel}
            </Heading>
            <button
              type="button"
              onClick={closeMovements}
              className="text-xs text-ui-fg-interactive hover:underline"
            >
              Close
            </button>
          </div>
          {movementsFor.loading ? (
            <Text size="small" className="text-ui-fg-muted">
              Loading…
            </Text>
          ) : movementsFor.movements.length === 0 ? (
            <Text size="small" className="text-ui-fg-muted">
              No movements yet.
            </Text>
          ) : (
            <ul className="divide-y text-sm">
              {movementsFor.movements.map((m) => (
                <li key={m.id} className="py-2 flex items-center gap-x-3">
                  <span className="w-24 text-xs text-ui-fg-muted shrink-0">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                  <Badge size="2xsmall" color="blue">
                    {m.reason}
                  </Badge>
                  <span
                    className={
                      m.qty_delta > 0
                        ? "font-mono w-12 text-green-700"
                        : "font-mono w-12 text-rose-700"
                    }
                  >
                    {m.qty_delta > 0 ? "+" : ""}
                    {m.qty_delta}
                  </span>
                  <span className="flex-1 text-xs text-ui-fg-subtle truncate">
                    {m.reference_type ? (
                      <>
                        <span className="text-ui-fg-muted">
                          {m.reference_type}
                        </span>{" "}
                        {m.reference_id ?? ""}
                      </>
                    ) : null}
                    {m.notes ? <> · {m.notes}</> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Container>
      ) : null}

      {actionFor ? (
        <Container className="border border-ui-border-strong p-4 flex flex-col gap-y-2">
          <div className="flex items-center justify-between">
            <Heading level="h3" className="text-base">
              {actionFor.kind === "adjust"
                ? "Reconcile stocktake"
                : "Receive print run"}{" "}
              · {actionFor.rowLabel}
            </Heading>
            <button
              type="button"
              onClick={() => setActionFor(null)}
              className="text-xs text-ui-fg-interactive hover:underline"
            >
              Cancel
            </button>
          </div>
          <div>
            <Label size="xsmall">
              {actionFor.kind === "adjust"
                ? "Counted quantity"
                : "Received quantity"}
            </Label>
            <Input
              inputMode="numeric"
              value={actionFor.quantity}
              onChange={(e) =>
                setActionFor((s) => (s ? { ...s, quantity: e.target.value } : s))
              }
            />
            {actionFor.kind === "adjust" ? (
              <Text size="xsmall" className="text-ui-fg-muted mt-1">
                Writes a single adjustment movement equal to the delta from
                current quantity_on_hand.
              </Text>
            ) : (
              <Text size="xsmall" className="text-ui-fg-muted mt-1">
                Increments quantity_on_hand. Use when a print run arrives at
                the warehouse.
              </Text>
            )}
          </div>
          <div>
            <Label size="xsmall">Notes</Label>
            <Textarea
              rows={2}
              value={actionFor.notes}
              onChange={(e) =>
                setActionFor((s) => (s ? { ...s, notes: e.target.value } : s))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="small"
              onClick={submitAction}
              disabled={actionFor.saving}
            >
              {actionFor.saving ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </Container>
      ) : null}

      {loading ? (
        <Text className="text-ui-fg-muted text-sm">Loading inventory…</Text>
      ) : visibleRows.length === 0 ? (
        <Container className="flex flex-col items-center gap-y-2 py-8 bg-ui-bg-subtle/40">
          <Text className="text-ui-fg-muted text-sm">No inventory rows.</Text>
          {designs.length > 0 ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              Click "+ Add SKU" to attach a design to a variant.
            </Text>
          ) : null}
        </Container>
      ) : (
        <Container className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left">Design</th>
                <th className="px-3 py-2 text-left">Garment</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-right">On hand</th>
                <th className="px-3 py-2 text-right">Reserved</th>
                <th className="px-3 py-2 text-right">Avail</th>
                <th className="px-3 py-2 text-right">Reorder</th>
                <th className="px-3 py-2 text-right">Unit $</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const low =
                  r.fulfillment_mode === "held_stock" &&
                  r.reorder_point != null &&
                  r.available <= r.reorder_point
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-ui-border-base hover:bg-ui-bg-subtle/30 ${r.is_active ? "" : "opacity-50"}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-x-2">
                        {r.design_thumbnail_url ? (
                          <img
                            src={r.design_thumbnail_url}
                            alt=""
                            className="h-8 w-8 object-contain rounded border border-ui-border-base"
                          />
                        ) : (
                          <div className="h-8 w-8 bg-ui-bg-subtle rounded" />
                        )}
                        <span className="truncate">
                          {r.design_name ?? r.organisation_design_id}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="truncate">
                        {r.customer_facing_label ??
                          r.variant_title ??
                          r.product_variant_id}
                      </div>
                      {r.product_title && !r.customer_facing_label ? (
                        <Text
                          size="xsmall"
                          className="text-ui-fg-muted truncate"
                        >
                          {r.product_title}
                        </Text>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        size="2xsmall"
                        color={r.fulfillment_mode === "held_stock" ? "green" : "blue"}
                      >
                        {r.fulfillment_mode === "held_stock" ? "Held" : "PoD"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.fulfillment_mode === "held_stock"
                        ? r.quantity_on_hand
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.fulfillment_mode === "held_stock"
                        ? r.quantity_reserved
                        : "—"}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right font-mono " +
                        (low ? "text-rose-700 font-semibold" : "")
                      }
                    >
                      {r.fulfillment_mode === "held_stock" ? r.available : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-ui-fg-muted">
                      {r.fulfillment_mode === "held_stock" && r.reorder_point != null
                        ? `≤${r.reorder_point}`
                        : r.fulfillment_mode === "print_on_demand" && r.lead_time_days
                          ? `${r.lead_time_days}d`
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(r.unit_price)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <div className="flex justify-end gap-x-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="text-ui-fg-interactive hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openMovements(r)}
                          className="text-ui-fg-interactive hover:underline"
                        >
                          Movements
                        </button>
                        {r.fulfillment_mode === "held_stock" && r.is_active ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openAction(r, "adjust")}
                              className="text-ui-fg-interactive hover:underline"
                            >
                              Reconcile
                            </button>
                            <button
                              type="button"
                              onClick={() => openAction(r, "receive")}
                              className="text-ui-fg-interactive hover:underline"
                            >
                              Receive
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Container>
      )}
    </div>
  )
}

export default InventoryTab
