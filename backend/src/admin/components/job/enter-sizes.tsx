import { Button, Input, Text, toast } from "@medusajs/ui"
import { useState } from "react"

type SizeOption = { variant_id: string; size: string; unit_price: number; available: number | null }
type Row = SizeOption & { qty: string; price: string }

/**
 * Sizes for an order line quoted without them: one quantity (and price) per
 * size, saved as a Medusa order edit that swaps the line for real size lines
 * (POST /admin/orders/:id/line-sizes).
 */
export function EnterSizes({ orderId, lineItemId, quantity, onDone }: { orderId: string; lineItemId: string; quantity: number; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const url = `/admin/orders/${encodeURIComponent(orderId)}/line-sizes`

  const open = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${url}?line_item_id=${encodeURIComponent(lineItemId)}`, { credentials: "include" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`)
      setRows((json.sizes as SizeOption[]).map((s) => ({ ...s, qty: "", price: s.unit_price.toFixed(2) })))
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't load the sizes")
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!rows) return
    setBusy(true)
    try {
      const sizes = rows.filter((r) => Number(r.qty) > 0).map((r) => ({ variant_id: r.variant_id, quantity: Number(r.qty), unit_price: Number(r.price) }))
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_item_id: lineItemId, sizes }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`)
      toast.success("Sizes saved")
      setRows(null)
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save the sizes")
    } finally {
      setBusy(false)
    }
  }

  if (!rows) {
    return (
      <Button size="small" variant="secondary" className="mt-1 ml-2" isLoading={busy} onClick={open}>
        Enter sizes
      </Button>
    )
  }

  const total = rows.reduce((n, r) => n + (Number(r.qty) || 0), 0)
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="mt-2 flex flex-col gap-y-2 rounded-md border border-ui-border-base p-2">
      <div className="grid grid-cols-[auto_5rem_6rem] items-center gap-x-2 gap-y-1">
        <Text size="xsmall" className="text-ui-fg-muted">Size</Text>
        <Text size="xsmall" className="text-ui-fg-muted">Qty</Text>
        <Text size="xsmall" className="text-ui-fg-muted">Each</Text>
        {rows.map((r, i) => (
          <div key={r.variant_id} className="contents">
            <Text size="small">
              {r.size}
              {r.available != null && r.available < 50 ? <span className="ml-1 text-xs text-ui-fg-muted">{r.available} in stock</span> : null}
            </Text>
            <Input size="small" type="number" min={0} value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} />
            <Input size="small" type="number" min={0} step="0.01" value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
          </div>
        ))}
      </div>
      <Text size="xsmall" className={total === quantity ? "text-ui-fg-subtle" : "text-ui-tag-red-text"}>
        {total} of {quantity}. Bigger sizes start at their extra garment cost; change any price before saving.
      </Text>
      <div className="flex gap-x-2">
        <Button size="small" isLoading={busy} disabled={total !== quantity} onClick={save}>Save sizes</Button>
        <Button size="small" variant="secondary" disabled={busy} onClick={() => setRows(null)}>Cancel</Button>
      </div>
    </div>
  )
}
