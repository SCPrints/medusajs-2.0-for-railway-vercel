"use client"

import { useEffect, useState } from "react"

import { getBrandKit, saveBrandKit, type BrandKit, type BrandKitPayload } from "@lib/data/org-ops"

const field = "min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-hidden focus:ring-2 focus:ring-ink"
const primary = "min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
const quiet = "min-h-11 px-2 text-sm font-medium text-ui-fg-interactive hover:underline"

const EMPTY: BrandKit = { colours: [], fonts: [], placement_notes: "", logo_artwork_ids: [] }

/**
 * Brand kit: the organisation's approved colours, fonts, placement rules and
 * official logos. Every member can read it; owners edit. (Not yet offered as
 * swatches inside the Studio.)
 */
export default function BrandKitTab({ orgId }: { orgId: string }) {
  const [data, setData] = useState<BrandKitPayload | null>(null)
  const [kit, setKit] = useState<BrandKit>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let live = true
    void getBrandKit(orgId).then((d) => {
      if (!live || !d) return
      setData(d)
      setKit(d.brand_kit)
    })
    return () => {
      live = false
    }
  }, [orgId])

  if (!data) return <p className="text-sm text-ui-fg-subtle">Loading…</p>
  const edit = data.can_edit

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const res = await saveBrandKit(orgId, kit)
    setBusy(false)
    if (!res.ok) return setMsg({ ok: false, text: res.error })
    setData(res.data)
    setKit(res.data.brand_kit)
    setMsg({ ok: true, text: "Saved." })
  }

  const setColour = (i: number, patch: Partial<BrandKit["colours"][number]>) =>
    setKit({ ...kit, colours: kit.colours.map((c, n) => (n === i ? { ...c, ...patch } : c)) })

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section>
        <h2 className="text-base font-semibold text-ui-fg-base">Approved colours</h2>
        {kit.colours.length === 0 ? <p className="mt-2 text-sm text-ui-fg-subtle">None yet.</p> : null}
        <ul className="mt-2 flex flex-col gap-2">
          {kit.colours.map((c, i) =>
            edit ? (
              <li key={i} className="grid grid-cols-[2.75rem_1fr_7rem_1fr_auto] items-center gap-2">
                <input aria-label="Pick a colour" type="color" className="min-h-11 w-11 rounded border border-ui-border-base" value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#000000"} onChange={(e) => setColour(i, { hex: e.target.value.toUpperCase() })} />
                <input aria-label="Colour name" className={field} placeholder="Name" maxLength={60} value={c.name} onChange={(e) => setColour(i, { name: e.target.value })} />
                <input aria-label="Hex colour" className={field} placeholder="#1A2B3C" maxLength={7} value={c.hex} onChange={(e) => setColour(i, { hex: e.target.value })} />
                <input aria-label="Pantone (optional)" className={field} placeholder="Pantone (optional)" maxLength={40} value={c.pantone ?? ""} onChange={(e) => setColour(i, { pantone: e.target.value || null })} />
                <button type="button" aria-label="Remove colour" className={quiet} onClick={() => setKit({ ...kit, colours: kit.colours.filter((_, n) => n !== i) })}>Remove</button>
              </li>
            ) : (
              <li key={i} className="flex items-center gap-3 text-sm text-ui-fg-base">
                <span className="size-8 rounded border border-ui-border-base" style={{ background: c.hex }} />
                {c.name} <span className="text-ui-fg-subtle">{c.hex}{c.pantone ? ` · Pantone ${c.pantone}` : ""}</span>
              </li>
            )
          )}
        </ul>
        {edit && kit.colours.length < 24 ? (
          <button type="button" className={quiet} onClick={() => setKit({ ...kit, colours: [...kit.colours, { name: "", hex: "#000000", pantone: null }] })}>Add a colour</button>
        ) : null}
      </section>

      <section>
        <h2 className="text-base font-semibold text-ui-fg-base">Fonts</h2>
        {edit ? (
          <input aria-label="Fonts, separated by commas" className={`${field} mt-2`} placeholder="Separate with commas, e.g. Montserrat, Open Sans" value={kit.fonts.join(", ")} onChange={(e) => setKit({ ...kit, fonts: e.target.value.split(",").map((f) => f.trim()).filter(Boolean).slice(0, 10) })} />
        ) : (
          <p className="mt-2 text-sm text-ui-fg-base">{kit.fonts.join(", ") || <span className="text-ui-fg-subtle">None yet.</span>}</p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-ui-fg-base">Where things go</h2>
        {edit ? (
          <textarea aria-label="Placement rules" className={`${field} mt-2 py-2`} rows={5} maxLength={2000} placeholder="e.g. Logo on the left chest, 8 cm wide. Never on the sleeve." value={kit.placement_notes} onChange={(e) => setKit({ ...kit, placement_notes: e.target.value })} />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ui-fg-base">{kit.placement_notes || <span className="text-ui-fg-subtle">None yet.</span>}</p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-ui-fg-base">Official logos</h2>
        {data.shared_artwork.length === 0 ? (
          <p className="mt-2 text-sm text-ui-fg-subtle">Share a logo from Your artwork with this organisation, then choose it here.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-3 tablet:grid-cols-4">
            {data.shared_artwork
              .filter((a) => edit || kit.logo_artwork_ids.includes(a.id))
              .map((a) => {
                const on = kit.logo_artwork_ids.includes(a.id)
                return (
                  <li key={a.id}>
                    <label className={`flex min-h-11 cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-center text-xs ${on ? "border-ink" : "border-ui-border-base"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.thumbnail_url ?? a.url} alt="" className="h-20 w-full object-contain" />
                      <span className="line-clamp-1">{a.name}</span>
                      {edit ? (
                        <input type="checkbox" className="size-4" checked={on} onChange={() => setKit({ ...kit, logo_artwork_ids: on ? kit.logo_artwork_ids.filter((x) => x !== a.id) : [...kit.logo_artwork_ids, a.id].slice(0, 20) })} />
                      ) : null}
                    </label>
                  </li>
                )
              })}
          </ul>
        )}
      </section>

      {edit ? (
        <div className="flex items-center gap-3">
          <button type="button" className={primary} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save brand kit"}</button>
          {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ui-fg-base" : "text-red-600"}`}>{msg.text}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
