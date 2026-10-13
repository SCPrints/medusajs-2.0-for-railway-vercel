import { Badge, Button, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

import type { OpenCart } from "../../../lib/open-carts"

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

/** Fetches `/admin/open-carts?q=` and renders each cart with artwork + "Convert to quote". */
export const OpenCartsList = ({
  q,
  emptyText = "No open carts.",
  onLoaded,
}: {
  q: string
  emptyText?: string
  onLoaded?: (count: number) => void
}) => {
  const [carts, setCarts] = useState<OpenCart[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCarts(null)
    fetch(`/admin/open-carts?q=${encodeURIComponent(q)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { carts: [] }))
      .then((d) => {
        if (cancelled) return
        setCarts(d.carts ?? [])
        onLoaded?.((d.carts ?? []).length)
      })
      .catch(() => !cancelled && setCarts([]))
    return () => {
      cancelled = true
    }
  }, [q])

  const toQuote = async (cartId: string) => {
    setBusy(cartId)
    try {
      const r = await fetch(`/admin/open-carts/${cartId}/quote`, { method: "POST", credentials: "include" })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.message ?? "Failed")
      window.location.href = `/app/quotes?id=${encodeURIComponent(d.quote_id)}`
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create quote")
      setBusy(null)
    }
  }

  if (carts === null) return <Text size="small" className="text-ui-fg-muted">Loading…</Text>
  if (!carts.length) return <Text size="small" className="text-ui-fg-muted">{emptyText}</Text>

  return (
    <div className="flex flex-col gap-4">
      {carts.map((cart) => (
        <div key={cart.id} className="border border-ui-border-base rounded-md p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Text weight="plus">
                {cart.customer_id ? (
                  <a className="underline" href={`/app/customers/${cart.customer_id}`}>
                    {cart.customer_name || cart.email}
                  </a>
                ) : (
                  cart.email || "Guest (no email yet)"
                )}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                {cart.id} · last active {when(cart.updated_at)}
                {cart.customer_name && cart.email ? ` · ${cart.email}` : ""}
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Text weight="plus">{money(cart.item_total)}</Text>
              {cart.quote_id ? (
                <Button size="small" variant="secondary" onClick={() => (window.location.href = `/app/quotes?id=${cart.quote_id}`)}>
                  Open quote
                </Button>
              ) : (
                <Button size="small" isLoading={busy === cart.id} disabled={!cart.email} onClick={() => toQuote(cart.id)}>
                  Convert to quote
                </Button>
              )}
            </div>
          </div>

          {cart.lines.map((line) => (
            <div key={line.id} className="flex gap-3">
              {line.thumbnail ? (
                <a href={line.thumbnail} target="_blank" rel="noreferrer">
                  <img src={line.thumbnail} alt="" className="w-20 h-20 object-cover rounded border border-ui-border-base" />
                </a>
              ) : (
                <div className="w-20 h-20 rounded bg-ui-bg-subtle" />
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <Text size="small" weight="plus">
                  {line.quantity} × {line.title}
                  {line.variant_title ? ` — ${line.variant_title}` : ""} · {money(line.unit_price)} ea
                </Text>
                <Text size="xsmall" className="text-ui-fg-muted">
                  {line.id} {line.has_design ? <Badge size="2xsmall" color="green">Custom design</Badge> : null}
                </Text>
                {line.files.map((f) => (
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="text-ui-fg-interactive text-xs underline">
                    {f.label}
                  </a>
                ))}
                {line.print_notes ? <Text size="xsmall">Notes: {line.print_notes}</Text> : null}
              </div>
            </div>
          ))}
          <Text size="xsmall" className="text-ui-fg-muted">Items total inc GST, excludes shipping.</Text>
        </div>
      ))}
    </div>
  )
}
