"use client"

import { useState } from "react"

import { getStockMovements, type StockMovement } from "@lib/data/org-ops"
import type { InventoryRow } from "@lib/data/organisations"

const REASON: Record<string, string> = {
  receipt: "Stock arrived",
  shipment: "Sent to you",
  reservation: "Set aside for an order",
  release: "Order cancelled, stock released",
  adjustment_up: "Stock count: more found",
  adjustment_down: "Stock count: less found",
  transfer_in: "Moved in",
  transfer_out: "Moved out",
}
const SIGN = { in: "+", out: "−", reserved: "", released: "" } as const
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`

/** Held-stock list as a CSV file (what is on screen, no staff-only fields). */
export function downloadStockCsv(rows: InventoryRow[]) {
  const head = ["Design", "Garment", "Mode", "On hand", "Reserved", "Available", "Reorder point"]
  const body = rows.map((r) => [
    r.design_name ?? "",
    r.customer_facing_label || [r.product_title, r.variant_title].filter(Boolean).join(" · "),
    r.fulfillment_mode === "held_stock" ? "Held" : "Print on demand",
    r.fulfillment_mode === "held_stock" ? r.quantity_on_hand : "",
    r.fulfillment_mode === "held_stock" ? r.quantity_reserved : "",
    r.fulfillment_mode === "held_stock" ? r.available : "",
    r.reorder_point ?? "",
  ])
  const blob = new Blob([[head, ...body].map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "held-stock.csv"
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * Per stock row: a "Low" marker and "Top up" (opens Our range, where the
 * design is ordered as usual: never an automatic order) when the row is at or
 * below its reorder point, and the movement history on tap.
 */
export default function StockExtras({ orgId, row, low }: { orgId: string; row: InventoryRow; low: boolean }) {
  const [open, setOpen] = useState(false)
  const [moves, setMoves] = useState<StockMovement[] | null>(null)

  const toggle = async () => {
    setOpen(!open)
    if (!moves) setMoves(await getStockMovements(orgId, row.id))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {low ? (
          <>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Low</span>
            <a href="#range" className="inline-flex min-h-11 items-center text-xs font-semibold text-ui-fg-interactive hover:underline">Top up</a>
          </>
        ) : null}
        {row.fulfillment_mode === "held_stock" ? (
          <button type="button" onClick={toggle} aria-expanded={open} className="min-h-11 px-1 text-xs font-medium text-ui-fg-interactive hover:underline">
            {open ? "Hide history" : "History"}
          </button>
        ) : null}
      </div>
      {open ? (
        moves === null ? (
          <p className="text-xs text-ui-fg-subtle">Loading…</p>
        ) : moves.length === 0 ? (
          <p className="text-xs text-ui-fg-subtle">No movements yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-xs text-ui-fg-base">
            {moves.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-2">
                <span className="text-ui-fg-subtle">{new Date(m.date).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="font-semibold tabular-nums">{SIGN[m.direction]}{m.quantity}</span>
                <span>{REASON[m.reason] ?? m.reason}</span>
                {m.reference ? <span className="text-ui-fg-subtle">({m.reference})</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
