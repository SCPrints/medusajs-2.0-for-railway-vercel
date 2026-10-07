"use client"

import { useDeferredValue, useState } from "react"

import type { PantoneSwatch } from "../pantone-chart-schema"

// ponytail: ~2,600 tiles rendered flat with a substring filter. Virtualise if it ever feels slow on phones.
export default function PantoneLibrary({ swatches }: { swatches: PantoneSwatch[] }) {
  const [query, setQuery] = useState("")
  const q = useDeferredValue(query.trim().toUpperCase().replace(/^(PANTONE|PMS)\s*/, ""))
  const shown = q ? swatches.filter((s) => s.name.toUpperCase().includes(q)) : swatches

  return (
    <>
      <label className="mt-6 flex max-w-md flex-col gap-1.5 text-sm font-medium text-ui-fg-base">
        Find a colour
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 286, Reflex Blue, Cool Gray"
          className="min-h-11 rounded-lg border border-ui-border-base bg-white px-3 text-base text-ui-fg-base outline-none focus:border-[var(--brand-secondary)]"
        />
      </label>
      <p className="mt-2 text-xs text-ui-fg-muted" aria-live="polite">
        {shown.length === swatches.length ? `${swatches.length} colours` : `${shown.length} of ${swatches.length} colours`}
      </p>
      <ul className="mt-5 grid list-none grid-cols-3 gap-2 p-0 phone:grid-cols-4 tablet:grid-cols-6 small:grid-cols-8 medium:grid-cols-10">
        {shown.map((s) => (
          <li key={s.name} className="overflow-hidden rounded-md border border-ui-border-base bg-white">
            <div className="aspect-square" style={{ backgroundColor: s.hex }} aria-hidden />
            <p className="truncate px-1.5 py-1 text-[11px] leading-tight text-ui-fg-subtle" title={`${s.name} · ${s.hex}`}>
              {s.name.replace(/^PANTONE /, "")}
            </p>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-ui-fg-subtle">Nothing matches. Try just the number, without the C.</p>
      ) : null}
    </>
  )
}
