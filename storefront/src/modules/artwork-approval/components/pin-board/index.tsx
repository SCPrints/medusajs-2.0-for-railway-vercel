"use client"

import { useRef } from "react"

import { MAX_PIN_NOTE, MAX_PROOF_PINS, type ProofPin } from "../../lib/pins"

type Props = {
  images: { url: string; label: string }[]
  pins: ProofPin[]
  onChange: (pins: ProofPin[]) => void
}

/**
 * Tap the picture to drop a numbered pin, then say what to change there.
 * Pins are optional: the plain "notes" box on the form still works for
 * anyone who can't point (keyboard, screen reader).
 */
const PinBoard = ({ images, pins, onChange }: Props) => {
  const lastAdded = useRef<number | null>(null)

  const drop = (imageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (pins.length >= MAX_PROOF_PINS) return
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    lastAdded.current = pins.length
    onChange([
      ...pins,
      {
        image_index: imageIndex,
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
        note: "",
      },
    ])
  }

  return (
    <div className="space-y-4">
      {images.map((img, i) => (
        <div key={img.url}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">{img.label}</p>
          {/* Pointer-only: keyboard users use the notes box instead. */}
          <div
            onClick={(e) => drop(i, e)}
            className="relative cursor-crosshair overflow-hidden rounded-lg border border-ink/8"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.label} draggable={false} className="block w-full select-none" />
            {pins.map((p, n) =>
              p.image_index === i ? (
                <span
                  key={n}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow-md ring-2 ring-white"
                >
                  {n + 1}
                </span>
              ) : null
            )}
          </div>
        </div>
      ))}

      {pins.length > 0 ? (
        <ol className="space-y-2">
          {pins.map((p, n) => (
            <li key={n} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
                {n + 1}
              </span>
              <input
                autoFocus={lastAdded.current === n}
                value={p.note}
                maxLength={MAX_PIN_NOTE}
                onChange={(e) => onChange(pins.map((x, j) => (j === n ? { ...x, note: e.target.value } : x)))}
                aria-label={`Note for spot ${n + 1}`}
                placeholder="What should change here?"
                className="block min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 py-2 text-base focus:border-brand focus:outline-hidden focus:ring-1 focus:ring-brand tablet:text-sm"
              />
              <button
                type="button"
                onClick={() => onChange(pins.filter((_, j) => j !== n))}
                aria-label={`Remove spot ${n + 1}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ui-fg-subtle hover:text-rose-700"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-ui-fg-subtle">Tap the picture where something needs to change.</p>
      )}
    </div>
  )
}

export default PinBoard
