"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { addSizingKit } from "@lib/data/sizing-kit"

import type { SizingKitOptions } from "./options"

const MAX = 12

/**
 * "Not sure of sizes? Order a sizing kit": one blank garment in each size the
 * team wants to try. Paid now at the normal price; refunded when it comes back
 * within 14 days (backend lib/sizing-kit.ts).
 */
export default function SizingKit({ options }: { options: SizingKitOptions }) {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [open, setOpen] = useState(false)
  const [colour, setColour] = useState(options[0]?.colour ?? "")
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!options.length) return null
  const sizes = options.find((o) => o.colour === colour)?.sizes ?? []

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]))

  const add = async () => {
    if (!picked.length || busy) return
    setBusy(true)
    setError(null)
    const err = await addSizingKit(picked, countryCode)
    setBusy(false)
    if (err) return setError(err)
    router.push(`/${countryCode}/cart`)
  }

  return (
    <section className="mt-4 rounded-lg border border-ui-border-base p-4" data-testid="sizing-kit">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 text-left text-sm font-semibold text-ui-fg-base underline underline-offset-4"
        >
          Not sure of sizes? Order a sizing kit
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-ui-fg-base">Sizing kit</p>
          <p className="text-sm text-ui-fg-subtle">
            We send one plain garment in each size you pick, so your team can try them on. You pay the garment
            price now. Send the kit back within 14 days in good order and we refund the garments (postage isn&apos;t
            refunded).
          </p>
          {options.length > 1 ? (
            <label className="flex flex-col gap-1 text-xs text-ui-fg-subtle">
              Colour
              <select
                value={colour}
                onChange={(e) => {
                  setColour(e.target.value)
                  setPicked([])
                }}
                className="min-h-11 rounded-md border border-ui-border-base bg-white px-3 text-base text-ui-fg-base tablet:text-sm"
              >
                {options.map((o) => (
                  <option key={o.colour} value={o.colour}>
                    {o.colour}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset>
            <legend className="text-xs text-ui-fg-subtle">Sizes (up to {MAX})</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {sizes.map((s) => {
                const on = picked.includes(s.variant_id)
                return (
                  <button
                    key={s.variant_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.variant_id)}
                    className={`min-h-11 min-w-11 rounded-md border px-3 text-sm font-medium ${
                      on ? "border-ink bg-ink text-white" : "border-ui-border-base bg-white text-ui-fg-base"
                    }`}
                  >
                    {s.size}
                  </button>
                )
              })}
            </div>
          </fieldset>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={add}
              disabled={!picked.length || busy}
              className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Adding…" : `Add kit to cart${picked.length ? ` (${picked.length})` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-md px-4 text-sm font-medium text-ui-fg-subtle"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
