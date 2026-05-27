"use client"

import * as React from "react"

// Animated icons for the home trust strip. Each icon's keyframes are defined
// in `tailwind.config.js`; the markup here just chooses which sub-elements
// carry which animation utility. Every animation is gated behind
// `motion-safe:` so users with `prefers-reduced-motion: reduce` get a static
// strip.

type StatIconProps = { className?: string }

// 1. NSW studio — pin pivots around its tip with an occasional left/right wiggle.
const PinIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`origin-bottom motion-safe:animate-pin-wiggle ${className ?? ""}`}
    aria-hidden
  >
    <path d="M12 22s-7-6.5-7-12a7 7 0 1114 0c0 5.5-7 12-7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

// 2. Australia-wide — truck drives off to the right (fading as it goes), then
// reappears from the left and slides back into place.
const TruckIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`motion-safe:animate-truck-drive ${className ?? ""}`}
    aria-hidden
  >
    <rect x="2" y="7" width="11" height="10" rx="1" />
    <path d="M13 10h4l4 4v3h-8" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </svg>
)

// 3. From 1 garment — a T-shirt with a printed star on the chest. The shirt
// outline is static; the star "stamps" onto it periodically (briefly
// disappears, then pops back on with an overshoot + squish) — reinforces
// the "we print on a single garment" message.
const TeeIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {/* T-shirt outline */}
    <path d="M8 4 C 8 7, 16 7, 16 4 L 19 4 L 22 7 L 19 10 L 19 20 L 5 20 L 5 10 L 2 7 L 5 4 Z" />
    {/* Printed star on the chest — fill so it reads as a print, not an outline. */}
    <path
      d="M 12 11.5 L 12.7 13.1 L 14.4 13.2 L 13.1 14.3 L 13.5 16 L 12 15.1 L 10.5 16 L 10.9 14.3 L 9.6 13.2 L 11.3 13.1 Z"
      fill="currentColor"
      stroke="none"
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      className="motion-safe:animate-print-stamp"
    />
  </svg>
)

// 4. Live order tracking — EKG-style waveform: a dim base line stays visible
// and a bright pulse segment travels along it left-to-right, like a heart
// monitor trace. Two paths share the same `d`: the base sits at ~25% opacity,
// the pulse uses a short dasharray + animated dashoffset to traverse.
const TrackerIcon = ({ className }: StatIconProps) => {
  const d = "M3 12h4l3-8 4 16 3-8h4"
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} style={{ opacity: 0.25 }} />
      <path
        d={d}
        pathLength="1"
        style={{ strokeDasharray: "0.12 0.88" }}
        className="motion-safe:animate-pulse-trace"
      />
    </svg>
  )
}

// 5. Free DPI check — the tick path periodically erases and re-draws itself
// via `stroke-dashoffset`. `pathLength="1"` normalises the path so a single
// dasharray value covers it regardless of its actual length.
const ArtworkCheckIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <path d="M3 13l5-4 4 3 3-2 6 4" />
    <path
      d="M14 20l3 3 5-6"
      pathLength="1"
      style={{ strokeDasharray: 1 }}
      className="motion-safe:animate-tick-draw"
    />
  </svg>
)

// 6. In-house proofs — the entire icon slides off to the right and back, and
// once it's settled the tick inside draws on. The two animations share an
// 8s cycle so the tick stays hidden while the icon is mid-flight.
const ProofIcon = ({ className }: StatIconProps) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`motion-safe:animate-slide-in-from-right ${className ?? ""}`}
    aria-hidden
  >
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path
      d="M8 14l3 3 5-5"
      pathLength="1"
      style={{ strokeDasharray: 1 }}
      className="motion-safe:animate-proof-tick-draw"
    />
  </svg>
)

type TrustStat = {
  Icon: React.FC<StatIconProps>
  lead: string
  subLine: string
}

const TRUST_STATS: TrustStat[] = [
  { Icon: PinIcon, lead: "NSW studio", subLine: "10+ years printing in Sydney" },
  { Icon: TruckIcon, lead: "Australia-wide", subLine: "Shipped from our studio" },
  { Icon: TeeIcon, lead: "From 1 garment", subLine: "No minimum order" },
  { Icon: TrackerIcon, lead: "Live order tracking", subLine: "Status at every stage" },
  { Icon: ArtworkCheckIcon, lead: "Free DPI check", subLine: "We catch low-res artwork early" },
  { Icon: ProofIcon, lead: "In-house proofs", subLine: "Digital mockup before we print" },
]

export default function HomeTrustStrip() {
  return (
    <section className="border-y border-ui-border-base bg-ui-bg-subtle">
      <ul className="content-container grid list-none grid-cols-2 gap-x-3 gap-y-4 px-4 py-5 phone:gap-x-6 phone:py-6 tablet:grid-cols-3 small:grid-cols-6">
        {TRUST_STATS.map((stat) => {
          const { Icon } = stat
          return (
            <li
              key={stat.lead}
              className="flex items-start gap-2.5 phone:gap-3"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-[var(--brand-secondary)] phone:size-6" />
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight text-ui-fg-base phone:text-sm">
                  {stat.lead}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-ui-fg-subtle phone:text-xs">
                  {stat.subLine}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
