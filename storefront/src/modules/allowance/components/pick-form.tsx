"use client"

import { useState } from "react"

import { submitPublicAllowance, type PublicAllowance } from "@lib/data/org-ops"

const field = "min-h-11 rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-hidden focus:ring-2 focus:ring-ink"

/**
 * One person's allowance: for each item, pick a size (and how many, up to
 * what they are entitled to). Pre-filled from the sizes the organisation
 * holds for them. They can come back and change it until it closes.
 */
export default function PickForm({ token, data }: { token: string; data: PublicAllowance }) {
  // Per item: a list of sizes, one entry per garment (so 2 polos = 2 selects).
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {}
    for (const item of data.items) {
      const saved = data.picks.filter((p) => p.design_id === item.design_id).flatMap((p) => Array(p.quantity).fill(p.size) as string[])
      out[item.design_id] = saved.length || data.submitted ? saved : item.suggested_size ? Array(item.per_person).fill(item.suggested_size) : []
    }
    return out
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const setSlot = (id: string, n: number, size: string) =>
    setChosen((c) => {
      const list = [...(c[id] ?? [])]
      list[n] = size
      return { ...c, [id]: list }
    })

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const counts = new Map<string, { design_id: string; size: string; quantity: number }>()
    for (const [design_id, sizes] of Object.entries(chosen)) {
      for (const size of sizes.filter(Boolean)) {
        const k = `${design_id}:${size}`
        counts.set(k, { design_id, size, quantity: (counts.get(k)?.quantity ?? 0) + 1 })
      }
    }
    const res = await submitPublicAllowance(token, Array.from(counts.values()))
    setBusy(false)
    setMsg(res.ok ? { ok: true, text: "Thanks, your choices are saved. You can change them here until it closes." } : { ok: false, text: res.error })
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      {data.items.map((item) => (
        <section key={item.design_id} className="rounded-2xl border border-ui-border-base bg-white p-4">
          <div className="flex items-center gap-3">
            {item.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbnail_url} alt="" className="size-16 rounded-md object-contain" />
            ) : null}
            <div>
              <p className="text-sm font-semibold text-ui-fg-base">{item.name}</p>
              <p className="text-xs text-ui-fg-subtle">{item.product_title ? `${item.product_title} · ` : ""}you get {item.per_person}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: item.per_person }, (_, n) => (
              <label key={n} className="flex items-center justify-between gap-3 text-sm text-ui-fg-base">
                {item.per_person > 1 ? `Size for #${n + 1}` : "Size"}
                <select className={field} value={chosen[item.design_id]?.[n] ?? ""} onChange={(e) => setSlot(item.design_id, n, e.target.value)}>
                  <option value="">None</option>
                  {item.sizes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      ))}
      <button type="button" onClick={save} disabled={busy} className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Saving…" : data.submitted ? "Save changes" : "Submit my choices"}
      </button>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ui-fg-base" : "text-red-600"}`}>{msg.text}</p> : null}
    </div>
  )
}
