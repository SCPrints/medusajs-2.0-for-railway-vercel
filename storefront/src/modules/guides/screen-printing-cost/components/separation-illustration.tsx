import type { CSSProperties, ReactNode } from "react"

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

// A screen as it looks on the bench: timber frame with mitred corners, yellow
// mesh, a block of emulsion with the design open in it, and a squeegee resting
// on a bead of that screen's ink.
const WOOD = "#d9b07c"
const WOOD_DARK = "#b9854a"
const MESH = "#f4e7a1"
const EMULSION = "#a797e0"
const W = 96
const H = 150
const F = 9 // frame thickness

const Screen = ({
  x,
  y,
  ink,
  label,
  children,
}: {
  x: number
  y: number
  ink: string
  label: string
  children: ReactNode
}) => (
  <>
    <rect x={x} y={y} width={W} height={H} rx="3" fill={WOOD} stroke={NAVY} strokeWidth="2.5" />
    <path
      d={`M${x} ${y}l${F} ${F}M${x + W} ${y}l${-F} ${F}M${x} ${y + H}l${F} ${-F}M${x + W} ${y + H}l${-F} ${-F}`}
      stroke={NAVY}
      strokeOpacity="0.45"
      strokeWidth="1.5"
    />
    <rect x={x + F} y={y + F} width={W - 2 * F} height={H - 2 * F} fill={MESH} stroke={NAVY} strokeWidth="1.5" />
    <rect x={x + F} y={y + F} width={W - 2 * F} height={H - 2 * F} fill="url(#sp-mesh)" />
    <rect x={x + F + 7} y={y + F + 8} width={W - 2 * F - 14} height={H - 2 * F - 16} rx="2" fill={EMULSION} />
    <rect x={x + F + 7} y={y + F + 8} width={W - 2 * F - 14} height={H - 2 * F - 16} rx="2" fill="url(#sp-mesh)" opacity="0.7" />
    {children}
    {/* squeegee: handle, rubber blade, ink bead */}
    <rect x={x + 20} y={y + 24} width={W - 40} height="9" rx="2" fill={WOOD_DARK} stroke={NAVY} strokeWidth="1.5" />
    <rect x={x + 22} y={y + 33} width={W - 44} height="4" fill={NAVY} />
    <rect x={x + 22} y={y + 37} width={W - 44} height="4.5" rx="2.25" fill={ink} />
    <text x={x + W / 2} y={y + H + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill={NAVY} fillOpacity="0.65">
      {label}
    </text>
  </>
)

const SCREENS = [
  { x: 6, y: 34, ink: TEAL, label: "Screen 1", shape: (cx: number, cy: number) => <Circle cx={cx} cy={cy} r={17} /> },
  { x: 108, y: 64, ink: PINK, label: "Screen 2", shape: (cx: number, cy: number) => <Bolt x={cx} y={cy} s={0.95} /> },
  { x: 210, y: 94, ink: NAVY, label: "Screen 3", shape: (cx: number, cy: number) => <Bars x={cx} y={cy - 6} s={0.95} /> },
]

/** Hero illustration: three screens, one per colour, building one print. */
export default function SeparationIllustration() {
  return (
    <figure className="m-0">
      <style>{CSS}</style>
      <svg
        viewBox="0 22 540 248"
        role="img"
        aria-label="Three screen printing frames, each with a squeegee and one ink colour, combine to print a single three-colour design on a t-shirt."
        className="h-auto w-full"
      >
        <defs>
          <pattern id="sp-mesh" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0 0H4M0 0V4" stroke={NAVY} strokeOpacity="0.2" strokeWidth="0.75" />
          </pattern>
        </defs>

        {SCREENS.map((s, i) => (
          <g key={s.label} className="sp-slide" style={delay(0.1 + i * 0.2)}>
            <Screen x={s.x} y={s.y} ink={s.ink} label={s.label}>
              {s.shape(s.x + W / 2, s.y + 92)}
            </Screen>
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
          <path d="M322 165h30" />
          <path d="M341 154l11 11-11 11" />
        </g>

        {/* Tee — same silhouette as the site's garment icon, scaled up. */}
        <g className="sp-slide" style={delay(0.75)}>
          <path
            d="M11 5l-5 3v6h4v12h12V14h4V8l-5-3-3 2.5a4 4 0 01-4 0z"
            transform="translate(364 62) scale(6.2)"
            fill="#fff"
            stroke={NAVY}
            strokeWidth="3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* Printed one colour at a time, in screen order. */}
        <g className="sp-pop" style={delay(1.0)}>
          <Circle cx={463} cy={162} r={21} />
        </g>
        <g className="sp-pop" style={delay(1.3)}>
          <Bolt x={463} y={162} s={1.15} />
        </g>
        <g className="sp-pop" style={delay(1.6)}>
          <Bars x={463} y={192} s={0.95} />
        </g>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-ui-fg-muted">
        One screen for every colour, printed one colour at a time.
      </figcaption>
    </figure>
  )
}
