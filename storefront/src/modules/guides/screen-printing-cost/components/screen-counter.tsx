"use client"

import { useState } from "react"

import { SCREEN_MAX_COLOURS } from "@modules/customizer/lib/scp-screen-print-pricing"

// Illustrative ink swatches only — not a colour chart.
const INKS = ["#1a1a2e", "#ff2e63", "#3dcfc2", "#f5a524", "#7c5cff", "#3aa655"]

/** Screens for one position: design colours + a white underbase on dark garments, capped at the press maximum. */
export function screensPerPosition(colours: number, dark: boolean): number {
  return Math.min(SCREEN_MAX_COLOURS, colours + (dark ? 1 : 0))
}

// New screens pop in as the count changes. CSS only; off for reduced motion.
const POP_CSS = `
@keyframes sc-pop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
.sc-pop { animation: sc-pop .25s ease-out both }
@media (prefers-reduced-motion: reduce) { .sc-pop { animation: none } }
`

const segment = (active: boolean) =>
  `min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold transition ${
    active
      ? "border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-white"
      : "border-ui-border-base bg-white text-ui-fg-base hover:border-[var(--brand-secondary)]/50"
  }`

// Mini screen: timber frame, yellow mesh, a block of that screen's ink.
const Frame = ({ fill, underbase }: { fill: string; underbase?: boolean }) => (
  <svg width="38" height="48" viewBox="0 0 38 48" aria-hidden>
    <rect x="1.5" y="1.5" width="35" height="45" rx="2.5" fill="#d9b07c" stroke="var(--brand-primary)" strokeWidth="2" />
    <rect x="6.5" y="6.5" width="25" height="35" fill="#f4e7a1" stroke="var(--brand-primary)" strokeWidth="1" />
    <rect
      x="10.5"
      y="12"
      width="17"
      height="24"
      rx="1.5"
      fill={fill}
      stroke={underbase ? "var(--brand-primary)" : "none"}
      strokeDasharray={underbase ? "3 3" : undefined}
      strokeOpacity="0.6"
    />
  </svg>
)

/**
 * "How many screens does my design need?" — counts screens, never prices.
 * The customiser is the only place a price is shown.
 */
export default function ScreenCounter() {
  const [colours, setColours] = useState(2)
  const [dark, setDark] = useState(false)
  const [positions, setPositions] = useState(1)

  const maxColours = SCREEN_MAX_COLOURS - (dark ? 1 : 0)
  const safeColours = Math.min(colours, maxColours)
  const perPosition = screensPerPosition(safeColours, dark)
  const total = perPosition * positions

  return (
    <div className="grid gap-6 rounded-2xl border border-ui-border-base bg-white p-6 small:grid-cols-2 small:p-8">
      <div className="space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold text-ui-fg-base">Colours in your design</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: SCREEN_MAX_COLOURS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={n > maxColours}
                aria-pressed={safeColours === n}
                onClick={() => setColours(n)}
                className={`${segment(safeColours === n)} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ui-fg-base">Garment colour</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={!dark} onClick={() => setDark(false)} className={segment(!dark)}>
              Light
            </button>
            <button type="button" aria-pressed={dark} onClick={() => setDark(true)} className={segment(dark)}>
              Dark
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ui-fg-base">Where it prints</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={positions === 1} onClick={() => setPositions(1)} className={segment(positions === 1)}>
              One position
            </button>
            <button type="button" aria-pressed={positions === 2} onClick={() => setPositions(2)} className={segment(positions === 2)}>
              Front and back
            </button>
          </div>
        </fieldset>
      </div>

      <div className="rounded-xl bg-ui-bg-subtle p-6" aria-live="polite">
        <style>{POP_CSS}</style>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Screens to set up
        </p>
        <p className="mt-1 text-6xl font-semibold leading-none text-[var(--brand-secondary)]">{total}</p>
        <p className="mt-3 text-sm text-ui-fg-subtle">
          {safeColours} colour{safeColours > 1 ? "s" : ""}
          {dark ? " + a white underbase" : ""}
          {positions === 2 ? ", on the front and again on the back" : ""}.
        </p>

        <div className="mt-5 space-y-3">
          {Array.from({ length: positions }, (_, p) => (
            <div key={p}>
              {positions === 2 ? (
                <p className="mb-1 text-xs font-medium text-ui-fg-muted">{p === 0 ? "Front" : "Back"}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: perPosition }, (_, i) => {
                  const underbase = dark && i === 0
                  return (
                    <span
                      key={`${p}-${i}-${underbase}`}
                      className="sc-pop inline-block"
                      style={{ animationDelay: `${i * 0.04}s` }}
                      title={underbase ? "White underbase" : `Colour ${i + (dark ? 0 : 1)}`}
                    >
                      <Frame fill={underbase ? "#fff" : INKS[(i - (dark ? 1 : 0)) % INKS.length]} underbase={underbase} />
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {dark ? (
          <p className="mt-3 text-xs text-ui-fg-muted">The dashed screen is the white underbase.</p>
        ) : null}
      </div>
    </div>
  )
}
