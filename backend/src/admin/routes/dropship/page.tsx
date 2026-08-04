import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { HelpTooltip } from "../../components/reports/help-tooltip"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
} from "@medusajs/ui"
import { ArrowPath } from "@medusajs/icons"
import { useCallback, useEffect, useMemo, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderItem = {
  line_item_id: string
  sku: string
  quantity: number
  title: string
}

type ShippingMethod = { code: string; name: string; description?: string }

type Shipment = {
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  shippedAt?: string
}

type PendingOrder = {
  order_id: string
  display_id: number
  created_at: string
  customer: string
  email: string
  items: OrderItem[]
  ascolour_last_error?: string | null
}

type SentOrder = PendingOrder & {
  ascolour_order_id: string
  ascolour_status: string | null
  ascolour_sent_at: string | null
  ascolour_shipments: Shipment[]
  ascolour_last_synced_at: string | null
  ascolour_last_error: string | null
}

type InHouseOrder = PendingOrder & {
  ascolour_in_house_at: string | null
  ascolour_in_house_note: string | null
}

type DropshipData = {
  pending: PendingOrder[]
  sent: SentOrder[]
  in_house: InHouseOrder[]
  default_shipping_method?: string | null
}

type SendResult = {
  order_id: string
  display_id: number
  status: "queued" | "sending" | "done" | "error"
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "—"
}

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "—"
}

/**
 * Flag an order as fulfilled from our own stock (or undo it). Keeps orders we
 * never send to AS Colour from sitting in the pending queue forever.
 */
const markInHouse = async (orderId: string, undo = false, note?: string) => {
  const res = await fetch("/admin/dropship/ascolour/in-house", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ order_id: orderId, undo, ...(note ? { note } : {}) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as any)?.message || `HTTP ${res.status}`)
}

const itemsSummary = (items: OrderItem[]) =>
  items.map((i) => `${i.sku} ×${i.quantity}`).join(", ")

const statusBadgeColor = (
  status: string | null
): "green" | "red" | "blue" | "grey" => {
  if (!status) return "grey"
  if (/shipped|delivered/i.test(status)) return "green"
  if (/cancel/i.test(status)) return "red"
  return "blue"
}

// ─── Settings panel ───────────────────────────────────────────────────────────

type Settings = {
  shippingMethod: string
  orderNotes: string
  courierInstructions: string
}

const SettingsPanel = ({
  settings,
  onChange,
  defaultOpen = false,
  methods = [],
}: {
  settings: Settings
  onChange: (s: Settings) => void
  defaultOpen?: boolean
  methods?: ShippingMethod[]
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Container className="p-0">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ui-bg-subtle/30 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <Text size="small" weight="plus">
          Shared send settings
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle">
          {open ? "▲ hide" : "▼ show"}
        </Text>
      </button>

      {open && (
        <div className="flex flex-col gap-y-3 border-t border-ui-border-base px-4 py-4">
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="drop-shipping-method" className="text-xs">
              Shipping method
            </Label>
            {methods.length > 0 ? (
              <select
                id="drop-shipping-method"
                className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-1.5 text-sm text-ui-fg-base focus:outline-none"
                value={settings.shippingMethod}
                onChange={(e) =>
                  onChange({ ...settings, shippingMethod: e.target.value })
                }
              >
                <option value="" disabled>
                  Select a method…
                </option>
                {methods.map((m) => (
                  <option key={m.code} value={m.code} title={m.description}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="drop-shipping-method"
                placeholder="e.g. Standard"
                value={settings.shippingMethod}
                onChange={(e) =>
                  onChange({ ...settings, shippingMethod: e.target.value })
                }
              />
            )}
          </div>

          <div className="flex flex-col gap-y-1">
            <Label htmlFor="drop-notes" className="text-xs">
              Order notes
            </Label>
            <Textarea
              id="drop-notes"
              placeholder="Visible to AS Colour customer service."
              value={settings.orderNotes}
              onChange={(e) =>
                onChange({ ...settings, orderNotes: e.target.value })
              }
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-y-1">
            <Label htmlFor="drop-courier" className="text-xs">
              Courier instructions
            </Label>
            <Textarea
              id="drop-courier"
              placeholder="Visible to the courier driver only."
              value={settings.courierInstructions}
              onChange={(e) =>
                onChange({ ...settings, courierInstructions: e.target.value })
              }
              rows={2}
            />
          </div>
        </div>
      )}
    </Container>
  )
}

// ─── Pending tab ──────────────────────────────────────────────────────────────

const PendingTab = ({
  orders,
  onSendComplete,
  defaultShippingMethod,
}: {
  orders: PendingOrder[]
  onSendComplete: () => void
  defaultShippingMethod?: string | null
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Which order rows are expanded to reveal their per-line checkboxes.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Per-order line selection. An order ABSENT from this map = all its lines
  // selected (the default). Once the user unticks a line we store an explicit
  // set for that order.
  const [itemSelection, setItemSelection] = useState<Record<string, Set<string>>>(
    {}
  )
  const [settings, setSettings] = useState<Settings>({
    shippingMethod: defaultShippingMethod ?? "",
    orderNotes: "",
    courierInstructions: "",
  })
  const hasShippingMethod = settings.shippingMethod.trim().length > 0
  const [results, setResults] = useState<SendResult[]>([])
  const [sending, setSending] = useState(false)
  const [methods, setMethods] = useState<ShippingMethod[]>([])
  const [markingId, setMarkingId] = useState<string | null>(null)

  const handleMarkInHouse = async (order: PendingOrder) => {
    // Cancel aborts; OK with an empty field proceeds without a note.
    const note = window.prompt(
      `Fulfil #${order.display_id} from your own stock — optional note (e.g. "had 20 navy tees on the shelf"):`,
      ""
    )
    if (note === null) return
    setMarkingId(order.order_id)
    try {
      await markInHouse(order.order_id, false, note.trim() || undefined)
      onSendComplete()
    } catch (err: any) {
      alert(`Could not mark #${order.display_id} as in-house: ${err?.message ?? err}`)
    } finally {
      setMarkingId(null)
    }
  }

  // AS Colour publishes valid shipping methods (code + name) — fetch them so
  // the settings panel offers a picker that sends a real code.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/admin/dropship/ascolour/shipping-methods", {
          credentials: "include",
          headers: { Accept: "application/json" },
        })
        const body = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray(body?.methods)) setMethods(body.methods)
      } catch {
        // Leave empty — the panel falls back to a free-text input.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Reset selection when orders list changes (after a send completes)
  useEffect(() => {
    setSelected(new Set())
    setItemSelection({})
    setExpanded(new Set())
  }, [orders])

  // All line ids for an order (the implicit "everything selected" default).
  const allLineIds = (order: PendingOrder) =>
    order.items.map((i) => i.line_item_id).filter(Boolean)

  // The effective set of line ids that will be sent for this order.
  const selectedLineIds = (order: PendingOrder): Set<string> =>
    itemSelection[order.order_id] ?? new Set(allLineIds(order))

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleItem = (order: PendingOrder, lineId: string) =>
    setItemSelection((prev) => {
      const current = prev[order.order_id] ?? new Set(allLineIds(order))
      const next = new Set(current)
      next.has(lineId) ? next.delete(lineId) : next.add(lineId)
      return { ...prev, [order.order_id]: next }
    })

  const allSelected = orders.length > 0 && selected.size === orders.length
  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(orders.map((o) => o.order_id))
    )
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectedOrders = useMemo(
    () => orders.filter((o) => selected.has(o.order_id)),
    [orders, selected]
  )

  const handleSend = async () => {
    if (!selectedOrders.length) return
    setSending(true)

    const initial: SendResult[] = selectedOrders.map((o) => ({
      order_id: o.order_id,
      display_id: o.display_id,
      status: "queued",
    }))
    setResults(initial)

    for (let i = 0; i < selectedOrders.length; i++) {
      const order = selectedOrders[i]

      // Resolve which lines to send. All ticked → omit the filter (full order,
      // identical to legacy behaviour). A strict subset → pass the explicit
      // ids. Nothing ticked → don't call the API; flag it so the operator sees
      // they need to re-tick at least one line.
      const included = selectedLineIds(order)
      const totalLines = order.items.length
      if (included.size === 0) {
        setResults((prev) =>
          prev.map((r) =>
            r.order_id === order.order_id
              ? {
                  ...r,
                  status: "error",
                  error: "No line items ticked — nothing to send.",
                }
              : r
          )
        )
        continue
      }
      const includeLineItemIds =
        included.size < totalLines ? [...included] : undefined

      setResults((prev) =>
        prev.map((r) =>
          r.order_id === order.order_id ? { ...r, status: "sending" } : r
        )
      )

      try {
        const res = await fetch(
          `/admin/orders/${order.order_id}/send-to-ascolour`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              shippingMethod: settings.shippingMethod || undefined,
              orderNotes: settings.orderNotes || undefined,
              courierInstructions: settings.courierInstructions || undefined,
              includeLineItemIds,
            }),
          }
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error((body as any)?.message || `HTTP ${res.status}`)
        }
        setResults((prev) =>
          prev.map((r) =>
            r.order_id === order.order_id ? { ...r, status: "done" } : r
          )
        )
      } catch (err: any) {
        setResults((prev) =>
          prev.map((r) =>
            r.order_id === order.order_id
              ? { ...r, status: "error", error: err?.message ?? String(err) }
              : r
          )
        )
      }
    }

    setSending(false)
    onSendComplete()
  }

  if (orders.length === 0) {
    return (
      <Container className="flex flex-col items-center gap-y-3 py-12">
        <Text className="text-ui-fg-muted">
          No pending AS Colour orders — all caught up!
        </Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      <SettingsPanel
        settings={settings}
        onChange={setSettings}
        defaultOpen={!hasShippingMethod}
        methods={methods}
      />

      {/* Progress log */}
      {results.length > 0 && (
        <Container className="p-4">
          <Text size="small" weight="plus" className="mb-2">
            Send progress
          </Text>
          <ul className="flex flex-col gap-y-1 text-sm">
            {results.map((r) => (
              <li key={r.order_id} className="flex items-center gap-x-2">
                {r.status === "queued" && (
                  <Badge color="grey" size="2xsmall">queued</Badge>
                )}
                {r.status === "sending" && (
                  <Badge color="blue" size="2xsmall">sending…</Badge>
                )}
                {r.status === "done" && (
                  <Badge color="green" size="2xsmall">sent ✓</Badge>
                )}
                {r.status === "error" && (
                  <Badge color="red" size="2xsmall">error</Badge>
                )}
                <span>
                  Order #{r.display_id}
                  {r.status === "error" && r.error ? (
                    <span className="text-ui-fg-error ml-2">— {r.error}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {/* Orders table */}
      <Container className="p-0 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-x-3 px-4 py-2 border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs font-medium uppercase tracking-wide">
          <span className="w-4" aria-hidden />
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded cursor-pointer"
          />
          <span className="w-16">Order #</span>
          <span className="w-24">Date</span>
          <span className="w-36">Customer</span>
          <span className="flex-1">Items</span>
        </div>

        {orders.map((order) => {
          const isSelected = selected.has(order.order_id)
          const result = results.find((r) => r.order_id === order.order_id)
          const isSent = result?.status === "done"
          const isError = result?.status === "error"
          const isExpanded = expanded.has(order.order_id)
          const included = selectedLineIds(order)
          const totalLines = order.items.length
          const isSubset = included.size > 0 && included.size < totalLines
          const noneSelected = included.size === 0

          return (
            <div
              key={order.order_id}
              className={[
                "border-b border-ui-border-base last:border-b-0 transition",
                isSelected ? "bg-ui-bg-highlight" : "hover:bg-ui-bg-subtle/30",
                isSent ? "opacity-50" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Order summary row */}
              <div className="flex items-start gap-x-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(order.order_id)}
                  aria-label={isExpanded ? "Hide items" : "Show items"}
                  aria-expanded={isExpanded}
                  className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center text-ui-fg-subtle hover:text-ui-fg-base"
                >
                  <span className="text-[10px] leading-none">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </button>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(order.order_id)}
                  disabled={isSent || sending}
                  className="mt-0.5 h-4 w-4 rounded cursor-pointer"
                />
                <div className="w-16 shrink-0">
                  <a
                    href={`/app/orders/${order.order_id}`}
                    className="text-sm text-ui-fg-interactive hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    #{order.display_id}
                  </a>
                </div>
                <div className="w-24 shrink-0 text-sm text-ui-fg-subtle">
                  {fmtDate(order.created_at)}
                </div>
                <div className="w-36 shrink-0 text-sm truncate">
                  {order.customer || order.email || "—"}
                </div>
                <div className="flex-1 text-sm text-ui-fg-subtle break-all">
                  {itemsSummary(order.items)}
                  {isSubset ? (
                    <Badge color="orange" size="2xsmall" className="ml-2 align-middle">
                      {included.size}/{totalLines} lines → AS Colour
                    </Badge>
                  ) : null}
                  {noneSelected ? (
                    <Badge color="red" size="2xsmall" className="ml-2 align-middle">
                      no lines selected
                    </Badge>
                  ) : null}
                  {isError && result?.error ? (
                    <div className="text-ui-fg-error mt-0.5 text-xs">
                      {result.error}
                    </div>
                  ) : order.ascolour_last_error ? (
                    <div className="text-ui-fg-error mt-0.5 text-xs">
                      Previous attempt failed: {order.ascolour_last_error}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={sending || markingId === order.order_id}
                    isLoading={markingId === order.order_id}
                    onClick={() => handleMarkInHouse(order)}
                    title="Fulfilling this from our own stock — don't send it to AS Colour."
                  >
                    Fulfil from stock
                  </Button>
                </div>
              </div>

              {/* Expanded per-line checklist */}
              {isExpanded ? (
                <div className="flex flex-col gap-y-1.5 border-t border-ui-border-base bg-ui-bg-subtle/40 px-4 py-3 pl-14">
                  {order.items.map((item) => {
                    const checked = included.has(item.line_item_id)
                    return (
                      <label
                        key={item.line_item_id || item.sku}
                        className={[
                          "flex items-center gap-x-2 text-sm",
                          isSent || sending
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isSent || sending || !item.line_item_id}
                          onChange={() => toggleItem(order, item.line_item_id)}
                          className="h-4 w-4 rounded cursor-pointer"
                        />
                        <span className="font-mono text-xs">{item.sku}</span>
                        <span className="text-ui-fg-muted">×{item.quantity}</span>
                        {item.title ? (
                          <span className="text-ui-fg-subtle truncate">
                            — {item.title}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                  <Text size="xsmall" className="text-ui-fg-muted mt-1">
                    Untick any line you'll fulfil from your own stock — only
                    ticked lines are submitted to AS Colour.
                  </Text>
                </div>
              ) : null}
            </div>
          )
        })}
      </Container>

      {/* Bulk send button */}
      <div className="flex items-center justify-between">
        <Text size="small" className="text-ui-fg-subtle">
          {selected.size} of {orders.length} order{orders.length !== 1 ? "s" : ""} selected
        </Text>
        <div className="flex flex-col items-end gap-y-1">
          <Button
            variant="primary"
            disabled={selected.size === 0 || sending || !hasShippingMethod}
            isLoading={sending}
            onClick={handleSend}
          >
            {sending
              ? "Sending…"
              : `Send selected (${selected.size}) to AS Colour`}
          </Button>
          {!hasShippingMethod ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              Set a shipping method in “Shared send settings” to enable sending.
            </Text>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Sent tab ─────────────────────────────────────────────────────────────────

const SentTab = ({ orders }: { orders: SentOrder[] }) => {
  if (orders.length === 0) {
    return (
      <Container className="flex flex-col items-center gap-y-3 py-12">
        <Text className="text-ui-fg-muted">
          No AS Colour orders sent yet.
        </Text>
      </Container>
    )
  }

  return (
    <Container className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-x-3 px-4 py-2 border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs font-medium uppercase tracking-wide">
        <span className="w-16">Order #</span>
        <span className="w-24">Sent</span>
        <span className="w-32">AS Colour ID</span>
        <span className="w-28">Status</span>
        <span className="w-36">Customer</span>
        <span className="flex-1">Items / Tracking</span>
      </div>

      {orders.map((order) => {
        const color = statusBadgeColor(order.ascolour_status)
        const shipments = order.ascolour_shipments ?? []

        return (
          <div
            key={order.order_id}
            className="flex items-start gap-x-3 px-4 py-3 border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle/30 transition"
          >
            <div className="w-16 shrink-0">
              <a
                href={`/app/orders/${order.order_id}`}
                className="text-sm text-ui-fg-interactive hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                #{order.display_id}
              </a>
            </div>
            <div className="w-24 shrink-0 text-sm text-ui-fg-subtle">
              {fmtDate(order.ascolour_sent_at)}
            </div>
            <div className="w-32 shrink-0 text-sm font-mono">
              {order.ascolour_order_id}
            </div>
            <div className="w-28 shrink-0">
              <Badge color={color} size="2xsmall">
                {order.ascolour_status ?? "Sent"}
              </Badge>
            </div>
            <div className="w-36 shrink-0 text-sm truncate">
              {order.customer || order.email || "—"}
            </div>
            <div className="flex-1 text-sm text-ui-fg-subtle">
              <div>{itemsSummary(order.items)}</div>
              {shipments.length > 0 && (
                <ul className="mt-1 text-xs">
                  {shipments.map((s, i) => (
                    <li key={i}>
                      {s.carrier ? `${s.carrier} ` : ""}
                      {s.trackingUrl ? (
                        <a
                          href={s.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {s.trackingNumber ?? "Track"}
                        </a>
                      ) : (
                        <code>{s.trackingNumber ?? "—"}</code>
                      )}
                      {s.shippedAt ? ` · ${fmtDateTime(s.shippedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {order.ascolour_last_error && (
                <div className="text-ui-fg-error mt-1 text-xs">
                  Error: {order.ascolour_last_error}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </Container>
  )
}

// ─── In-house tab ─────────────────────────────────────────────────────────────

const InHouseTab = ({
  orders,
  onChange,
}: {
  orders: InHouseOrder[]
  onChange: () => void
}) => {
  const [undoingId, setUndoingId] = useState<string | null>(null)

  if (orders.length === 0) {
    return (
      <Container className="flex flex-col items-center gap-y-3 py-12">
        <Text className="text-ui-fg-muted">
          Nothing marked as fulfilled from your own stock.
        </Text>
      </Container>
    )
  }

  const handleUndo = async (order: InHouseOrder) => {
    setUndoingId(order.order_id)
    try {
      await markInHouse(order.order_id, true)
      onChange()
    } catch (err: any) {
      alert(`Could not move #${order.display_id} back: ${err?.message ?? err}`)
    } finally {
      setUndoingId(null)
    }
  }

  return (
    <Container className="p-0 overflow-hidden">
      <div className="flex items-center gap-x-3 px-4 py-2 border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs font-medium uppercase tracking-wide">
        <span className="w-16">Order #</span>
        <span className="w-24">Marked</span>
        <span className="w-36">Customer</span>
        <span className="flex-1">Items</span>
        <span className="w-28" />
      </div>

      {orders.map((order) => (
        <div
          key={order.order_id}
          className="flex items-start gap-x-3 px-4 py-3 border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle/30 transition"
        >
          <div className="w-16 shrink-0">
            <a
              href={`/app/orders/${order.order_id}`}
              className="text-sm text-ui-fg-interactive hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              #{order.display_id}
            </a>
          </div>
          <div className="w-24 shrink-0 text-sm text-ui-fg-subtle">
            {fmtDate(order.ascolour_in_house_at)}
          </div>
          <div className="w-36 shrink-0 text-sm truncate">
            {order.customer || order.email || "—"}
          </div>
          <div className="flex-1 text-sm text-ui-fg-subtle break-all">
            {itemsSummary(order.items)}
            {order.ascolour_in_house_note ? (
              <div className="text-xs text-ui-fg-muted italic mt-1">
                {order.ascolour_in_house_note}
              </div>
            ) : null}
          </div>
          <div className="w-28 shrink-0 flex justify-end">
            <Button
              size="small"
              variant="transparent"
              disabled={undoingId === order.order_id}
              isLoading={undoingId === order.order_id}
              onClick={() => handleUndo(order)}
            >
              Undo
            </Button>
          </div>
        </div>
      ))}
    </Container>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const AsColourDropshipPage = () => {
  const [data, setData] = useState<DropshipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "in_house">(
    "pending"
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/dropship/ascolour", {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      setData(body)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pending = data?.pending ?? []
  const sent = data?.sent ?? []
  const inHouse = data?.in_house ?? []

  return (
    <div className="flex flex-col gap-y-4">
      {/* Page header */}
      <Container className="flex items-start justify-between">
        <div>
          <Heading level="h1" className="flex items-center">
            AS Colour Orders
            <HelpTooltip
              text={{
                title: "AS Colour Orders",
                body: "Manage dropship fulfilment through AS Colour. Orders containing AS Colour SKUs appear here automatically. Pending orders have not been sent to AS Colour yet; Sent orders are being picked, packed, and shipped by AS Colour.",
                bullets: [
                  "Select one or more pending orders and click 'Send to AS Colour' to submit them for fulfilment.",
                  "Use Shared send settings to set a default shipping method, order notes, and courier instructions applied to every send in this session.",
                  "Fulfilling an order from your own stock? Click 'Fulfil from stock' to clear it out of Pending — it moves to the 'Fulfilled from stock' tab and can be undone.",
                  "Refresh pulls the latest status from AS Colour — tracking numbers appear here once AS Colour ships.",
                  "Only orders with AS Colour line items appear here; orders with mixed suppliers need manual split-fulfilment.",
                ],
              }}
            />
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            All orders with AS Colour items from the past 90 days. Select
            pending orders to send them together.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={load} disabled={loading}>
          <ArrowPath className="mr-1" />
          Refresh
        </Button>
      </Container>

      {/* Error */}
      {error ? (
        <Container>
          <Text className="text-ui-tag-red-icon">Failed to load: {error}</Text>
        </Container>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-x-1 border-b border-ui-border-base px-1">
        {(["pending", "sent", "in_house"] as const).map((tab) => {
          const count =
            tab === "pending"
              ? pending.length
              : tab === "sent"
                ? sent.length
                : inHouse.length
          const active = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                "px-4 py-2 text-sm font-medium capitalize transition border-b-2 -mb-px",
                active
                  ? "border-ui-fg-base text-ui-fg-base"
                  : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base",
              ].join(" ")}
            >
              {tab === "pending"
                ? "Pending"
                : tab === "sent"
                  ? "Sent"
                  : "Fulfilled from stock"}
              {loading && !data ? null : (
                <span className="ml-2 rounded-full bg-ui-bg-subtle px-1.5 py-0.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content. Only the *initial* load (no data yet) replaces the tab —
          a post-send refresh keeps PendingTab mounted so its send-progress log
          (and any error badges) survive instead of being wiped by the remount. */}
      {loading && !data ? (
        <Container>
          <Text className="text-ui-fg-subtle">Loading…</Text>
        </Container>
      ) : activeTab === "pending" ? (
        <PendingTab
          orders={pending}
          onSendComplete={load}
          defaultShippingMethod={data?.default_shipping_method ?? null}
        />
      ) : activeTab === "sent" ? (
        <SentTab orders={sent} />
      ) : (
        <InHouseTab orders={inHouse} onChange={load} />
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "AS Colour Orders",
  icon: tinted(ArrowPath, NAV_COLOR.production),
  rank: 22,
})

export default AsColourDropshipPage
