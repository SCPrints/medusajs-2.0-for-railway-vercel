import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Input, Label, Text, Textarea } from "@medusajs/ui"

import { HelpTooltip } from "../components/reports/help-tooltip"
import { useCallback, useEffect, useMemo, useState } from "react"

const adminPath = (orderId: string) => `/admin/orders/${orderId}/send-to-ascolour`

type PreviewItem = { sku: string; warehouse: string; quantity: number }

type Preview = {
  items?: PreviewItem[]
  shippingAddress?: Record<string, string | undefined>
  defaultShippingMethod?: string | null
  error?: string
}

type ShippingMethod = { code: string; name: string; description?: string }

type Shipment = {
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  shippedAt?: string
}

type StatusPayload = {
  sent: boolean
  ascolour_order_id: string | null
  ascolour_status: string | null
  ascolour_sent_at: string | null
  ascolour_shipments: Shipment[]
  ascolour_last_synced_at: string | null
  last_sync_error: string | null
  last_error: string | null
  preview: Preview
}

const formatDate = (iso: string | null) => {
  if (!iso) return "—"
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return "—"
  return new Date(ts).toLocaleString()
}

const OrderAsColourDropshipWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shippingMethod, setShippingMethod] = useState("")
  const [orderNotes, setOrderNotes] = useState("")
  const [courierInstructions, setCourierInstructions] = useState("")
  const [methods, setMethods] = useState<ShippingMethod[]>([])
  const [methodsError, setMethodsError] = useState<string | null>(null)

  // AS Colour publishes the valid shipping methods (code + name). Fetch them so
  // we offer a picker that sends a real `code` instead of a guessed label.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/admin/dropship/ascolour/shipping-methods", {
          credentials: "include",
          headers: { Accept: "application/json" },
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        const list: ShippingMethod[] = Array.isArray(body?.methods) ? body.methods : []
        setMethods(list)
        setMethodsError(body?.error ? String(body.error) : null)
        const def: string | null = body?.default ?? null
        if (def && list.some((m) => m.code === def)) {
          setShippingMethod((cur) => cur || def)
        }
      } catch (e) {
        if (!cancelled) setMethodsError(e instanceof Error ? e.message : "load failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(adminPath(orderId), {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      const body = (await res.json().catch(() => ({}))) as StatusPayload & { message?: string }
      if (!res.ok) throw new Error((body as any)?.message || `HTTP ${res.status}`)
      setStatus(body)
      if (body.preview?.defaultShippingMethod && !shippingMethod) {
        setShippingMethod(body.preview.defaultShippingMethod)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AS Colour status")
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [orderId, shippingMethod])

  useEffect(() => {
    void load()
  }, [load])

  const previewItems = status?.preview?.items ?? []

  // Only render the card when there's something to act on — items to forward,
  // an order already sent to AS Colour, or an error worth surfacing. On orders
  // with no AS Colour SKUs this hides the card entirely instead of an empty one.
  const hasContent =
    Boolean(status?.sent) ||
    previewItems.length > 0 ||
    Boolean(status?.preview?.error) ||
    Boolean(error)

  const sendOrder = useCallback(async () => {
    if (!orderId) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(adminPath(orderId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          shippingMethod: shippingMethod || undefined,
          orderNotes: orderNotes || undefined,
          courierInstructions: courierInstructions || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as any)?.message || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send AS Colour order")
    } finally {
      setSending(false)
    }
  }, [orderId, shippingMethod, orderNotes, courierInstructions, load])

  const summaryRow = useMemo(() => {
    if (!status) return null
    if (status.sent) {
      const statusLabel = status.ascolour_status ?? "Sent"
      const isShipped = /shipped|delivered/i.test(statusLabel)
      const isCancelled = /cancel/i.test(statusLabel)
      const badgeColor: "green" | "red" | "blue" | "grey" = isCancelled
        ? "red"
        : isShipped
          ? "green"
          : "blue"
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <Text size="small" weight="plus">
              AS Colour order #{status.ascolour_order_id}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Sent {formatDate(status.ascolour_sent_at)}
              {status.ascolour_last_synced_at
                ? ` · Synced ${formatDate(status.ascolour_last_synced_at)}`
                : ""}
            </Text>
          </div>
          <Badge color={badgeColor}>{statusLabel}</Badge>
        </div>
      )
    }
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Not sent yet — review the items and click "Send to AS Colour" once the artwork is ready.
      </Text>
    )
  }, [status])

  if (!hasContent) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2" className="flex items-center">
          AS Colour dropship
          <HelpTooltip
            text={{
              title: "AS Colour dropship",
              body: "Sends this order's blank garments directly from AS Colour's warehouse to your production address via their dropship programme.",
              bullets: [
                "Review the SKU and quantity summary before submitting — changes require a new dropship request.",
                "Status updates here once AS Colour confirms the dispatch.",
              ],
            }}
          />
        </Heading>
        {loading ? <Badge color="grey">Loading…</Badge> : null}
      </div>

      <div className="flex flex-col gap-y-4 px-6 py-4">
        {summaryRow}

        {error ? (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        ) : null}
        {status?.last_error ? (
          <Text size="small" className="text-ui-fg-error">
            Previous attempt failed: {status.last_error}
          </Text>
        ) : null}
        {status?.last_sync_error ? (
          <Text size="small" className="text-ui-fg-error">
            Last status sync failed: {status.last_sync_error}
          </Text>
        ) : null}

        {status?.sent && status.ascolour_shipments?.length ? (
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              Shipments ({status.ascolour_shipments.length})
            </Text>
            <ul className="text-ui-fg-subtle text-sm">
              {status.ascolour_shipments.map((s, i) => (
                <li
                  key={`${s.trackingNumber ?? "ship"}-${i}`}
                  className="flex justify-between gap-2"
                >
                  <span>
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
                  </span>
                  <span>{s.shippedAt ? formatDate(s.shippedAt) : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!status?.sent && previewItems.length > 0 ? (
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              Items to forward ({previewItems.length})
            </Text>
            <ul className="text-ui-fg-subtle text-sm">
              {previewItems.map((item) => (
                <li key={`${item.sku}-${item.warehouse}`} className="flex justify-between">
                  <span>
                    <code>{item.sku}</code> @ {item.warehouse}
                  </span>
                  <span>× {item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status?.preview?.error ? (
          <Text size="small" className="text-ui-fg-error">
            Preview problem: {status.preview.error}
          </Text>
        ) : null}

        {!status?.sent && previewItems.length > 0 ? (
          <div className="flex flex-col gap-y-3">
            <div>
              <Label htmlFor="ascolour-shipping-method">Shipping method</Label>
              {methods.length > 0 ? (
                <select
                  id="ascolour-shipping-method"
                  className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-1.5 text-sm text-ui-fg-base focus:outline-none"
                  value={shippingMethod}
                  onChange={(e) => setShippingMethod(e.target.value)}
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
                  id="ascolour-shipping-method"
                  placeholder={status?.preview?.defaultShippingMethod ?? "e.g. Standard"}
                  value={shippingMethod}
                  onChange={(e) => setShippingMethod(e.target.value)}
                />
              )}
              {methodsError ? (
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  Couldn’t load AS Colour’s method list ({methodsError}). Type the
                  code manually.
                </Text>
              ) : null}
            </div>
            <div>
              <Label htmlFor="ascolour-notes">Order notes</Label>
              <Textarea
                id="ascolour-notes"
                placeholder="Visible to AS Colour customer service. e.g. TEST ORDER — please cancel"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="ascolour-courier">Courier instructions</Label>
              <Textarea
                id="ascolour-courier"
                placeholder="Visible to the courier driver only."
                value={courierInstructions}
                onChange={(e) => setCourierInstructions(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-col items-end gap-y-1">
              <Button
                variant="primary"
                disabled={sending || !shippingMethod.trim()}
                onClick={sendOrder}
              >
                {sending ? "Sending…" : "Send to AS Colour"}
              </Button>
              {!shippingMethod.trim() ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  Enter a shipping method to enable sending.
                </Text>
              ) : null}
            </div>
          </div>
        ) : null}

        {status?.sent ? (
          <div className="flex justify-end">
            <Button variant="secondary" disabled={loading} onClick={load}>
              Refresh status
            </Button>
          </div>
        ) : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default withWidgetBoundary(OrderAsColourDropshipWidget, "order-ascolour-dropship")
