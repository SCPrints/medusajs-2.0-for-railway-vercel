import type { CSSProperties } from "react"

const NAVY = "var(--brand-primary)"
const PINK = "var(--brand-secondary)"
const TEAL = "var(--brand-accent)"

// Pure CSS, one-shot on load: no JS, so the picture is in the server HTML and
// never waits on hydration. `both` fill keeps the end state; reduced-motion
// users get the finished picture with no movement.
const CSS = `
@keyframes sp-slide { from { opacity: 0; transform: translateX(-28px) } to { opacity: 1; transform: none } }
@keyframes sp-pop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
.sp-slide { animation: sp-slide .55s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s) }
.sp-pop { animation: sp-pop .45s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s); transform-box: fill-box; transform-origin: center }
@media (prefers-reduced-motion: reduce) { .sp-slide, .sp-pop { animation: none } }
`

const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties

// The same three shapes appear once on their own screen and once, layered,
// on the tee — that is the whole point of the picture.
const Circle = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <circle cx={cx} cy={cy} r={r} fill={TEAL} />
)
const Bolt = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <polygon
    fill={PINK}
    points={[
      [4, -18], [-12, 3], [-2, 3], [-6, 18], [12, -4], [1, -4],
    ]
      .map(([px, py]) => `${x + px * s},${y + py * s}`)
      .join(" ")}
  />
)
const Bars = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <g fill={NAVY}>
    <rect x={x - 22 * s} y={y} width={44 * s} height={5 * s} rx={2.5 * s} />
    <rect x={x - 14 * s} y={y + 9 * s} width={28 * s} height={5 * s} rx={2.5 * s} />
  </g>
)

const SCREENS = [
  { x: 14, y: 22, label: "Screen 1", shape: (cx: number, cy: number) => <Circle cx={cx} cy={cy} r={24} /> },
  { x: 62, y: 96, label: "Screen 2", shape: (cx: number, cy: number) => <Bolt x={cx} y={cy} s={1.4} /> },
  { x: 110, y: 170, label: "Screen 3", shape: (cx: number, cy: number) => <Bars x={cx} y={cy - 8} s={1.3} /> },
]

/** Hero illustration: three screens, one per colour, building one print. */
export default function SeparationIllustration() {
  return (
    <figure className="m-0">
      <style>{CSS}</style>
      <svg
        viewBox="0 0 520 330"
        role="img"
        aria-label="Three screens, one for each ink colour, combine to print a single three-colour design on a t-shirt."
        className="h-auto w-full"
      >
        <defs>
          <pattern id="sp-mesh" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 0H6M0 0V6" stroke={NAVY} strokeOpacity="0.14" strokeWidth="1" />
          </pattern>
        </defs>

        {SCREENS.map((s, i) => (
          <g key={s.label} className="sp-slide" style={delay(0.1 + i * 0.2)}>
            <rect x={s.x} y={s.y} width="140" height="128" rx="8" fill="#fff" stroke={NAVY} strokeWidth="3" />
            <rect x={s.x + 12} y={s.y + 12} width="116" height="104" rx="3" fill="url(#sp-mesh)" />
            <rect x={s.x + 12} y={s.y + 12} width="116" height="104" rx="3" fill="none" stroke={NAVY} strokeOpacity="0.25" />
            {s.shape(s.x + 70, s.y + 64)}
            <text x={s.x + 16} y={s.y + 28} fontSize="11" fontWeight="600" fill={NAVY} fillOpacity="0.6">
              {s.label}
            </text>
          </g>
        ))}

        <g
          className="sp-slide"
          style={delay(0.75)}
          stroke={NAVY}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M270 165h36" />
          <path d="M294 153l12 12-12 12" />
        </g>

        {/* Tee — same silhouette as the site's garment icon, scaled up. */}
        <g className="sp-slide" style={delay(0.75)}>
          <path
            d="M11 5l-5 3v6h4v12h12V14h4V8l-5-3-3 2.5a4 4 0 01-4 0z"
            transform="translate(318 62) scale(6.2)"
            fill="#fff"
            stroke={NAVY}
            strokeWidth="3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* Printed one colour at a time, in screen order. */}
        <g className="sp-pop" style={delay(1.0)}>
          <Circle cx={417} cy={162} r={21} />
        </g>
        <g className="sp-pop" style={delay(1.3)}>
          <Bolt x={417} y={162} s={1.15} />
        </g>
        <g className="sp-pop" style={delay(1.6)}>
          <Bars x={417} y={192} s={0.95} />
        </g>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-ui-fg-muted">
        One screen for every colour, printed one colour at a time.
      </figcaption>
    </figure>
  )
}
