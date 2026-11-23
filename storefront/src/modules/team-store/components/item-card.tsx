"use client"

import { addTeamStoreItemsToCart } from "@lib/data/cart"
import type { TeamStoreItem } from "@lib/data/team-stores"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams } from "next/navigation"
import { useState } from "react"

const aud = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

/** One garment: mockup, price, a quantity per size, one Add to cart. */
export default function ItemCard({ item, storeId, handle }: { item: TeamStoreItem; storeId: string; handle: string }) {
  const { countryCode } = useParams<{ countryCode: string }>()
  const [qty, setQty] = useState<Record<string, number>>({})
  const [shot, setShot] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const units = Object.values(qty).reduce((a, b) => a + b, 0)
  const images = item.mockups.length ? item.mockups : item.thumbnail ? [item.thumbnail] : []

  const bump = (variantId: string, by: number) =>
    setQty((q) => ({ ...q, [variantId]: Math.max(0, Math.min(99, (q[variantId] ?? 0) + by)) }))

  const add = async () => {
    setBusy(true)
    setMsg(null)
    const lines = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([variantId, quantity]) => ({ itemId: item.id, variantId, quantity }))
    const r = await addTeamStoreItemsToCart({ countryCode, teamStoreId: storeId, handle, lines })
    setBusy(false)
    if (r.ok) {
      setQty({})
      setMsg({ ok: true, text: `Added ${units} to your cart.` })
    } else setMsg({ ok: false, text: r.error })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-3">
      {images.length ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={images[shot]} alt={`${item.title} in ${item.colour}`} className="aspect-square w-full rounded-lg bg-ui-bg-subtle object-contain" />
      ) : null}
      {images.length > 1 ? (
        <div className="flex gap-2">
          {images.map((src, i) => (
            <button key={src} onClick={() => setShot(i)} className={`h-11 w-11 rounded border ${i === shot ? "border-(--brand-primary)" : ""}`} aria-label={`View ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      ) : null}
      <div>
        <p className="font-semibold">{item.title}</p>
        <p className="text-sm text-ui-fg-subtle">{item.colour}</p>
        <p className="mt-1 text-lg font-semibold">{aud(item.unit_price)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {item.sizes.map((s) => (
          <div key={s.variant_id} className="flex items-center justify-between rounded-md border px-2">
            <span className="text-sm font-medium">{s.size}</span>
            <div className="flex items-center">
              <button className="min-h-11 min-w-11 text-lg" onClick={() => bump(s.variant_id, -1)} aria-label={`One less ${s.size}`}>
                −
              </button>
              <span className="w-6 text-center tabular-nums">{qty[s.variant_id] ?? 0}</span>
              <button className="min-h-11 min-w-11 text-lg" onClick={() => bump(s.variant_id, 1)} aria-label={`One more ${s.size}`}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={add}
        disabled={!units || busy}
        className="min-h-11 rounded-md bg-(--brand-primary) px-4 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Adding…" : units ? `Add ${units} to cart · ${aud(units * item.unit_price)}` : "Pick a size"}
      </button>
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>
          {msg.text}{" "}
          {msg.ok ? (
            <LocalizedClientLink href="/cart" className="underline">
              Go to cart
            </LocalizedClientLink>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
