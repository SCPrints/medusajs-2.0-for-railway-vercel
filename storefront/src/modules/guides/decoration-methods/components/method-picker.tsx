"use client"

import { useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MethodSwatch from "@modules/guides/decoration-methods/components/method-swatch"
import {
  ARTWORK_LABEL,
  GARMENT_LABEL,
  QUANTITY_LABEL,
  recommendMethods,
  type Artwork,
  type Garment,
  type Method,
  type Quantity,
  type Verdict,
} from "@modules/guides/decoration-methods/recommend"

const METHOD: Record<Method, { name: string; inline: string; href: string }> = {
  dtf: { name: "DTF print", inline: "DTF printing", href: "/services/digital-transfers" },
  screen: { name: "Screen printing", inline: "screen printing", href: "/services/screen-printing" },
  embroidery: { name: "Embroidery", inline: "embroidery", href: "/services/embroidery" },
}

// Tints are literal rgba: Tailwind's `/opacity` modifier is a no-op on hex CSS variables.
const VERDICT: Record<Verdict, { label: string; badge: string; row: string }> = {
  best: {
    label: "Best match",
    badge: "bg-[var(--brand-secondary)] !text-white",
    row: "border-[var(--brand-secondary)] bg-white shadow-sm",
  },
  works: {
    label: "Also works",
    badge: "bg-[rgba(61,207,194,0.2)] !text-[#147a71]",
    row: "border-ui-border-base bg-white",
  },
  avoid: {
    label: "Not for this job",
    badge: "bg-ui-bg-subtle !text-ui-fg-muted",
    row: "border-ui-border-base bg-ui-bg-subtle opacity-70",
  },
}

const segment = (active: boolean) =>
  `min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
    active
      ? "border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-white"
      : "border-ui-border-base bg-white text-ui-fg-base hover:border-[var(--brand-secondary)]"
  }`

function Group<T extends string>({
  legend,
  value,
  onChange,
  labels,
}: {
  legend: string
  value: T
  onChange: (v: T) => void
  labels: Record<T, string>
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ui-fg-base">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.entries(labels) as [T, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={segment(value === key)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Three questions in, the three methods ranked out. Recommends; never prices. */
export default function MethodPicker() {
  const [quantity, setQuantity] = useState<Quantity>("small")
  const [artwork, setArtwork] = useState<Artwork>("logo")
  const [garment, setGarment] = useState<Garment>("tee")

  const ranked = recommendMethods({ quantity, artwork, garment })

  return (
    <div className="grid gap-6 rounded-2xl border border-ui-border-base bg-white p-6 small:grid-cols-2 small:p-8">
      <div className="space-y-5">
        <Group legend="How many pieces?" value={quantity} onChange={setQuantity} labels={QUANTITY_LABEL} />
        <Group legend="What is the artwork?" value={artwork} onChange={setArtwork} labels={ARTWORK_LABEL} />
        <Group legend="What is it going on?" value={garment} onChange={setGarment} labels={GARMENT_LABEL} />
      </div>

      <ol className="space-y-3 rounded-xl bg-ui-bg-subtle p-4 small:p-5" aria-live="polite">
        {ranked.map((r) => {
          const v = VERDICT[r.verdict]
          const m = METHOD[r.method]
          return (
            <li key={r.method} className={`flex gap-4 rounded-xl border p-4 transition ${v.row}`}>
              <MethodSwatch method={r.method} id={`pick-${r.method}`} className="h-14 w-14 shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-ui-fg-base">{m.name}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${v.badge}`}>{v.label}</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-sm text-ui-fg-subtle">
                  {r.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {r.verdict === "best" ? (
                  <LocalizedClientLink
                    href={m.href}
                    className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold !text-[var(--brand-secondary)] underline underline-offset-4"
                  >
                    More about {m.inline}
                  </LocalizedClientLink>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
