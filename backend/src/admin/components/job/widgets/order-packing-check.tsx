import { withWidgetBoundary } from "../../../components/widget-error-boundary"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Checkbox, Container, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { HelpTooltip } from "../../../components/reports/help-tooltip"
import {
  LINE_CHECKS,
  ORDER_CHECKS,
  type PackingCheckState,
  isComplete,
  lineKey,
  orderKey,
  requiredKeys,
} from "../../../../lib/packing-check"

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
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<boolean | null>(null)

  useEffect(() => {
    if (!orderId) return
    fetch(`/admin/orders/${orderId}/packing-check`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setState(s))
      .catch(() => {})
  }, [orderId])

  if (!orderId || items.length === 0) return null

  const save = async (keys: string[], checked: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/packing-check`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, checked }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setState(json)
      if (json.completed_at && !state.completed_at) {
        toast.success("Packing check complete — ready to ship.")
        setOpen(false)
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save tick.")
    } finally {
      setBusy(false)
    }
  }

  const required = requiredKeys(lineIds)
  const done = required.filter((k) => state.ticks[k]).length
  const total = required.length
  const complete = isComplete(state, lineIds)
  const stage = (data.metadata as Record<string, unknown> | null)?.production_stage
  const shipped =
    stage === "shipped" ||
    stage === "delivered" ||
    ["shipped", "partially_shipped", "delivered", "partially_delivered"].includes(
      String(data.fulfillment_status ?? "")
    )
  // Collapsed by default once there's nothing left to do here.
  const expanded = open ?? !(complete || shipped)

  const Tick = ({ k, label }: { k: string; label: string }) => {
    const tick = state.ticks[k]
    return (
      <span title={tick ? `${label} — ${tick.by ?? "staff"} · ${fmt(tick.at)}` : label}>
        <Checkbox
          checked={!!tick}
          disabled={busy}
          aria-label={label}
          onCheckedChange={(v) => void save([k], v === true)}
        />
      </span>
    )
  }

  const summary = complete && state.completed_at
    ? `Packed by ${state.completed_by ?? "staff"} · ${fmt(state.completed_at)}`
    : shipped
      ? `Shipped without a full packing check (${done} / ${total})`
      : `${done} / ${total} checks done`

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-2 px-6 py-4">
        <div>
          <Heading level="h2" className="flex items-center">
            Packing check
            <HelpTooltip
              text={{
                title: "Dispatch packing checklist",
                body: "Tick each line and the box checks before shipping. Every tick records who and when (hover a tick to see).",
                bullets: [
                  "Right items = correct garment, colour, sizes & quantity. Quality OK = placement right, no defects. Bagged = folded & bagged.",
                  "Tick row confirms all three for a line at once.",
                  "Unticking anything clears the 'complete' stamp.",
                  "Print packing slip gives the same checklist on paper — put a copy in the box.",
                ],
              }}
            />
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            {summary}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Badge size="2xsmall" color={complete ? "green" : shipped ? "grey" : "orange"}>
            {complete ? "Ready to ship" : shipped ? "Shipped" : "Not checked"}
          </Badge>
          <Button size="small" variant="secondary" onClick={() => printSlip(data)}>
            Print packing slip
          </Button>
          <Button size="small" variant="transparent" onClick={() => setOpen(!expanded)}>
            {expanded ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
      {expanded ? (
        <>
          <div className="overflow-x-auto px-6 py-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ui-fg-subtle text-xs text-left">
                  <th className="py-1 font-normal">Item</th>
                  <th className="py-1 font-normal text-center">Qty</th>
                  {LINE_CHECKS.map((c) => (
                    <th key={c.id} className="py-1 font-normal text-center whitespace-nowrap" title={c.label}>
                      {c.short}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const keys = LINE_CHECKS.map((c) => lineKey(item.id, c.id))
                  const rowDone = keys.every((k) => state.ticks[k])
                  return (
                    <tr key={item.id} className="border-t border-ui-border-base">
                      <td className="py-2 pr-3">
                        <Text size="small" weight="plus">
                          {item.product_title ?? item.title}
                        </Text>
                        {item.variant_title ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {item.variant_title}
                          </Text>
                        ) : null}
                      </td>
                      <td className="py-2 text-center font-medium">{item.quantity}</td>
                      {LINE_CHECKS.map((c) => (
                        <td key={c.id} className="py-2 text-center">
                          <Tick k={lineKey(item.id, c.id)} label={c.label} />
                        </td>
                      ))}
                      <td className="py-2 pl-2 text-right">
                        <Button
                          size="small"
                          variant="transparent"
                          disabled={busy}
                          onClick={() => void save(keys, !rowDone)}
                        >
                          {rowDone ? "Untick row" : "Tick row"}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
            <Text size="small" weight="plus">
              Box
            </Text>
            {ORDER_CHECKS.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <Tick k={orderKey(c.id)} label={c.label} />
                <Text size="small">{c.label}</Text>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </Container>
  )
}

export default withWidgetBoundary(OrderPackingCheckWidget, "order-packing-check")
