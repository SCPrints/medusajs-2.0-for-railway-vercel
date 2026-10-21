import { Button, Checkbox, Input, Label, Text, toast } from "@medusajs/ui"
import { useState } from "react"

type Props = {
  quote: {
    id: string
    contact_name?: string | null
    contact_phone?: string | null
    company?: string | null
    metadata?: Record<string, unknown> | null
  }
  onDone: (result: { order_id: string; display_id: number | string | null }) => void
  onCancel: () => void
}

/**
 * "Where does it ship?" asked before a quote becomes an order — a guest quote
 * used to convert with the studio's own address as the ship-to (#114).
 * Prefilled from the quote's stored address; Pick up skips it. Used by the
 * quote drawer and the Job page.
 */
export function ConvertAddressForm({ quote, onDone, onCancel }: Props) {
  const stored = (quote.metadata?.delivery_address ?? null) as Record<string, string> | null
  const [pickup, setPickup] = useState(quote.metadata?.delivery_method === "pickup")
  const [addr, setAddr] = useState({
    address_1: stored?.address_1 ?? "",
    address_2: stored?.address_2 ?? "",
    city: stored?.city ?? "",
    province: stored?.province ?? "NSW",
    postal_code: stored?.postal_code ?? "",
    phone: stored?.phone ?? quote.contact_phone ?? "",
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof addr) => (e: { target: { value: string } }) => setAddr((a) => ({ ...a, [k]: e.target.value }))
  const valid = pickup || (addr.address_1.trim() && addr.city.trim() && addr.postal_code.trim().length >= 3)

  const submit = async () => {
    if (!valid) return
    const [first, ...rest] = String(quote.contact_name ?? "").trim().split(/\s+/).filter(Boolean)
    setBusy(true)
    try {
      const res = await fetch(`/admin/quotes/${quote.id}/convert-to-order`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pickup
            ? { pickup: true }
            : {
                shipping_address: {
                  first_name: first,
                  last_name: rest.join(" ") || undefined,
                  company: quote.company ?? undefined,
                  address_1: addr.address_1.trim(),
                  address_2: addr.address_2.trim() || undefined,
                  city: addr.city.trim(),
                  province: addr.province.trim() || undefined,
                  postal_code: addr.postal_code.trim(),
                  country_code: "au",
                  phone: addr.phone.trim() || undefined,
                },
              }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as any)?.error ?? `HTTP ${res.status}`)
      const skipped = (json as any)?.skipped_items?.length ?? 0
      toast.success(
        `Order #${(json as any)?.display_id ?? "created"} — ${(json as any)?.lines_added ?? 0} line(s)${skipped ? `, ${skipped} skipped (no product/variant)` : ""}`
      )
      onDone({ order_id: (json as any).order_id, display_id: (json as any).display_id ?? null })
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to convert quote")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
      <Text size="small" weight="plus">
        Convert to order — where does it ship?
      </Text>
      <Text size="xsmall" className="text-ui-fg-muted">
        Creates the unpaid order at the quoted prices and emails the tax invoice. The address is kept on the quote.
      </Text>
      <label className="flex items-center gap-x-2 text-sm">
        <Checkbox checked={pickup} onCheckedChange={(v) => setPickup(v === true)} />
        Pick up from the studio
      </label>
      {!pickup ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label size="xsmall">Street address</Label>
            <Input size="small" value={addr.address_1} onChange={set("address_1")} placeholder="18 Kerr Cres" />
          </div>
          <div className="col-span-2">
            <Label size="xsmall">Unit / company</Label>
            <Input size="small" value={addr.address_2} onChange={set("address_2")} />
          </div>
          <div>
            <Label size="xsmall">Suburb</Label>
            <Input size="small" value={addr.city} onChange={set("city")} placeholder="Pagewood" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label size="xsmall">State</Label>
              <Input size="small" value={addr.province} onChange={set("province")} placeholder="NSW" />
            </div>
            <div>
              <Label size="xsmall">Postcode</Label>
              <Input size="small" value={addr.postal_code} onChange={set("postal_code")} placeholder="2035" />
            </div>
          </div>
          <div className="col-span-2">
            <Label size="xsmall">Phone (courier)</Label>
            <Input size="small" value={addr.phone} onChange={set("phone")} />
          </div>
        </div>
      ) : null}
      <div className="flex justify-end gap-x-2">
        <Button size="small" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="small" isLoading={busy} disabled={busy || !valid} onClick={submit}>
          Create order
        </Button>
      </div>
    </div>
  )
}
