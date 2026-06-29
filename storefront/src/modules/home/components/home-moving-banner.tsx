"use client"

import { useEffect, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Floating "we're moving" announcement card. Same dismiss-and-cooldown pattern
// as add-to-home-banner. Edit the MOVE block when the relocation is confirmed —
// it's the only place that needs touching, and the card auto-retires GRACE_DAYS
// after the move date so a stale notice never lingers in production.
const MOVE = {
  // ponytail: the three values to set once the move is locked in.
  dateMs: Date.parse("2026-07-01T00:00:00+10:00"), // move-in date, AEST
  suburb: "Villawood", // new studio: 7 Epic Place, Villawood NSW 2163
  newAddressHref: "/contact", // where "See our new address" points
}

const DISMISS_KEY = "sc-prints:moving-dismissed-at"
const DAY = 24 * 60 * 60 * 1000
/** Re-show this long after a dismissal so people still get reminded pre-move. */
const COOLDOWN_DAYS = 7
/** Keep showing this many days past the move date, then retire for good. */
const GRACE_DAYS = 10

// Animated moving-box icon: the box hops/rocks while trailing motion lines
// pulse behind it. Gated behind prefers-reduced-motion so it holds still for
// users who ask for less motion.
const MOVING_BOX_CSS = `
@media (prefers-reduced-motion: no-preference){
  .scp-mvbox{animation:scp-mvbox 1.8s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  .scp-mvlines{animation:scp-mvlines 1.8s ease-in-out infinite;transform-box:fill-box}
}
@keyframes scp-mvbox{0%,100%{transform:translate(0,0) rotate(0)}35%{transform:translate(1px,-2px) rotate(-4deg)}70%{transform:translate(0,0) rotate(2deg)}}
@keyframes scp-mvlines{0%,100%{opacity:.2;transform:translateX(0)}50%{opacity:.65;transform:translateX(-2px)}}
`

/** Pure visibility rule — unit-tested in home-moving-banner.spec.ts. */
export function movingBannerVisible(opts: {
  now: number
  dismissedAt: number | null
  moveDateMs: number
  graceDays: number
  cooldownDays: number
}): boolean {
  const { now, dismissedAt, moveDateMs, graceDays, cooldownDays } = opts
  if (now > moveDateMs + graceDays * DAY) return false
  if (dismissedAt != null && now - dismissedAt < cooldownDays * DAY) return false
  return true
}

export default function HomeMovingBanner() {
  const [shown, setShown] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(DISMISS_KEY)
    const dismissedAt = raw && Number.isFinite(Number(raw)) ? Number(raw) : null
    const visible = movingBannerVisible({
      now: Date.now(),
      dismissedAt,
      moveDateMs: MOVE.dateMs,
      graceDays: GRACE_DAYS,
      cooldownDays: COOLDOWN_DAYS,
    })
    if (!visible) return
    // Let the hero settle before sliding the card in (keeps it out of LCP).
    const t = window.setTimeout(() => {
      setShown(true)
      window.requestAnimationFrame(() => setAnimateIn(true))
    }, 800)
    return () => window.clearTimeout(t)
  }, [])

  if (!shown) return null

  const dismiss = () => {
    setAnimateIn(false)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }
    window.setTimeout(() => setShown(false), 250)
  }

  const dateLabel = new Date(MOVE.dateMs).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
  })
  const place = MOVE.suburb ? `in ${MOVE.suburb}, NSW` : "in NSW"

  return (
    <div className="fixed inset-x-0 top-[5.5rem] z-40 pointer-events-none small:inset-x-auto small:right-5 small:top-[8.5rem]">
      <div className="pointer-events-auto mx-auto max-w-lg px-3 small:mx-0 small:max-w-md small:px-0">
        <div
          className={`rounded-2xl border-2 border-[var(--brand-secondary)]/20 bg-white p-5 shadow-2xl transition-all duration-300 ease-out ${
            animateIn ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
          }`}
        >
          <style>{MOVING_BOX_CSS}</style>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-secondary)]/[0.08]">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--brand-secondary)]"
                aria-hidden
              >
                <g className="scp-mvbox">
                  <path d="M21 8.5 12 13 3 8.5 12 4z" />
                  <path d="M3 8.5v7L12 20l9-4.5v-7" />
                  <path d="M12 13v7" />
                  <path d="M7.5 6.25 16.5 10.75" />
                </g>
                <g className="scp-mvlines">
                  <path d="M3.5 12.5H1.5" />
                  <path d="M3 15H0.5" />
                </g>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-ui-fg-base phone:text-lg">
                We&rsquo;re moving studios
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ui-fg-subtle">
                From {dateLabel} we&rsquo;ll be printing from a new studio {place}{" "}
                — same team, same turnaround, your orders ship as normal.
              </p>
              <LocalizedClientLink
                href={MOVE.newAddressHref}
                onClick={dismiss}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-secondary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
              >
                See our new address
              </LocalizedClientLink>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss moving notice"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 text-ui-fg-muted hover:text-ui-fg-base"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
