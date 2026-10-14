import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Checkbox, Container, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"
import {
  LINE_CHECKS,
  ORDER_CHECKS,
  type PackingCheckState,
  isComplete,
  lineKey,
  orderKey,
  requiredKeys,
} from "../../lib/packing-check"

/**
 * Dispatch packing checklist — staff tick each line (right items, quality OK,
 * bagged) and the box (complete, slip in, label matches, sealed) before the
 * order ships. Every tick records who + when. "Print packing slip" gives the
 * same checklist on paper for the packing bench.
 */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

function printSlip(order: AdminOrder) {
  const a = order.shipping_address
  const address = a
    ? [
        [a.first_name, a.last_name].filter(Boolean).join(" "),
        a.company,
        a.address_1,
        a.address_2,
        [a.city, a.province, a.postal_code].filter(Boolean).join(" "),
        a.phone,
      ]
        .filter(Boolean)
        .map(esc)
        .join("<br>")
    : "—"
  const box = "&#9744;"
  const rows = (order.items ?? [])
    .map(
      (i) => `<tr>
        <td>${esc(i.product_title ?? i.title)}<div class="sub">${esc(i.variant_title ?? "")}${
          i.variant_sku ? ` · ${esc(i.variant_sku)}` : ""
        }</div></td>
        <td class="c qty">${i.quantity}</td>
        ${LINE_CHECKS.map(() => `<td class="c">${box}</td>`).join("")}
      </tr>`
    )
    .join("")
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip #${order.display_id}</title>
<style>
  body{font:13px/1.4 system-ui,sans-serif;margin:24px;color:#111}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#666;font-size:11px}
  .top{display:flex;justify-content:space-between;gap:24px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:12px 0} th,td{border:1px solid #999;padding:6px;vertical-align:top}
  th{background:#f2f2f2;font-size:11px;text-align:left} .c{text-align:center;font-size:18px} .qty{font-size:14px;font-weight:600}
  ul{list-style:none;padding:0} li{font-size:14px;margin:6px 0}
  .sign{margin-top:28px;display:flex;gap:40px} .sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px}
</style></head><body>
<div class="top">
  <div><h1>SC Prints — Packing slip</h1><div>Order #${order.display_id} · ${esc(
    new Date(order.created_at as string).toLocaleDateString("en-AU")
  )}</div><div class="sub">${esc(order.email)}</div></div>
  <div><strong>Ship to</strong><br>${address}</div>
</div>
<table><thead><tr><th>Item</th><th>Qty</th>${LINE_CHECKS.map((c) => `<th>${esc(c.label)}</th>`).join(
    ""
  )}</tr></thead><tbody>${rows}</tbody></table>
<strong>Before sealing</strong>
<ul>${ORDER_CHECKS.map((c) => `<li>${box} ${esc(c.label)}</li>`).join("")}</ul>
<div class="sign"><div>Packed by</div><div>Checked by</div><div>Date</div></div>
<script>window.onload=()=>window.print()</script>
</body></html>`
  const w = window.open("", "_blank")
  if (!w) return toast.error("Pop-up blocked — allow pop-ups to print.")
  w.document.write(html)
  w.document.close()
}

const OrderPackingCheckWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const items = data?.items ?? []
  const lineIds = items.map((i) => i.id)
  const [state, setState] = useState<PackingCheckState>({ ticks: {} })
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return
    fetch(`/admin/orders/${orderId}/packing-check`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setState(s))
      .catch(() => {})
  }, [orderId])

  if (!orderId || items.length === 0) return null

  const toggle = async (key: string, checked: boolean) => {
    setBusy(key)
    try {
      const res = await fetch(`/admin/orders/${orderId}/packing-check`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, checked }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setState(json)
      if (json.completed_at && !state.completed_at) toast.success("Packing check complete — ready to ship.")
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save tick.")
    } finally {
      setBusy(null)
    }
  }

  const required = requiredKeys(lineIds)
  const done = required.filter((k) => state.ticks[k]).length
  const total = required.length
  const complete = isComplete(state, lineIds)

  const Row = ({ k, label }: { k: string; label: string }) => {
    const tick = state.ticks[k]
    return (
      <label className="flex items-center gap-2 py-1 cursor-pointer">
        <Checkbox
          checked={!!tick}
          disabled={busy === k}
          onCheckedChange={(v) => void toggle(k, v === true)}
        />
        <Text size="small" className={tick ? "text-ui-fg-subtle" : undefined}>
          {label}
        </Text>
        {tick ? (
          <Text size="xsmall" className="text-ui-fg-muted ml-auto whitespace-nowrap">
            {tick.by ?? "staff"} · {fmt(tick.at)}
          </Text>
        ) : null}
      </label>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-2 px-6 py-4">
        <div>
          <Heading level="h2" className="flex items-center">
            Packing check
            <HelpTooltip
              text={{
                title: "Dispatch packing checklist",
                body: "Tick each line and the box checks before shipping. Every tick records who and when.",
                bullets: [
                  "Unticking anything clears the 'complete' stamp.",
                  "Print packing slip gives the same checklist on paper — put a copy in the box.",
                ],
              }}
            />
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            {complete && state.completed_at
              ? `Completed by ${state.completed_by ?? "staff"} · ${fmt(state.completed_at)}`
              : `${done} / ${total} checks done`}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Badge size="2xsmall" color={complete ? "green" : "orange"}>
            {complete ? "Ready to ship" : "Not checked"}
          </Badge>
          <Button size="small" variant="secondary" onClick={() => printSlip(data)}>
            Print packing slip
          </Button>
        </div>
      </div>
      {items.map((item) => (
        <div key={item.id} className="px-6 py-3">
          <Text size="small" weight="plus">
            {item.product_title ?? item.title} · qty {item.quantity}
          </Text>
          {item.variant_title ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {item.variant_title}
            </Text>
          ) : null}
          {LINE_CHECKS.map((c) => (
            <Row key={c.id} k={lineKey(item.id, c.id)} label={c.label} />
          ))}
        </div>
      ))}
      <div className="px-6 py-3">
        <Text size="small" weight="plus">
          Box
        </Text>
        {ORDER_CHECKS.map((c) => (
          <Row key={c.id} k={orderKey(c.id)} label={c.label} />
        ))}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default withWidgetBoundary(OrderPackingCheckWidget, "order-packing-check")
