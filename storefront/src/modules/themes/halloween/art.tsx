import type { ReactNode, SVGProps } from "react"

import s from "./halloween.module.css"

/*
 * Original Halloween mascots, drawn in code as manga-style ink + cel paint.
 *
 * Every outline is a FILLED calligraphic ribbon (`inkPath`): a centreline of
 * [x, y, width] points, thick on the shadow side and the outer silhouette,
 * thin on the lit side and interior detail, tapered to nothing at the ends.
 * Lines overshoot or leave gaps at corners on purpose. The paint layer is
 * offset ~1px from the ink (misregistered print), carries a paper-grain
 * filter, two shadow tones, screentone dots in the shadows, cross-hatching in
 * the deepest shadow and a thin rim light. The ink layer runs through a tiny
 * turbulence/displacement filter so no curve is mathematically perfect.
 *
 * Light comes from the top-left. Colours are literal: decorations don't
 * follow brand tokens. No third-party characters, names or logos.
 */

type Props = SVGProps<SVGSVGElement>
/** [x, y, inkWidth] — width only matters for `inkPath`. */
export type P = readonly [number, number, number]

export const INK = "#1f1235"
export const PALE = "#f8f1ff"
export const TONGUE = "#ff5c8a"

const r1 = (n: number) => Math.round(n * 10) / 10

type Sample = { x: number; y: number; nx: number; ny: number; w: number }

/** Catmull-Rom centreline through `pts`, `steps` samples per segment. */
function samples(pts: readonly P[], closed: boolean, steps = 6): Sample[] {
  const n = pts.length
  const at = (i: number) =>
    closed ? pts[((i % n) + n) % n] : pts[Math.min(Math.max(i, 0), n - 1)]
  const segs = closed ? n : n - 1
  const out: Sample[] = []
  const push = (i: number, t: number) => {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const t2 = t * t
    const t3 = t2 * t
    const pos = (k: 0 | 1) =>
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
    const der = (k: 0 | 1) =>
      0.5 *
      (-p0[k] +
        p2[k] +
        2 * (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t +
        3 * (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t2)
    const dx = der(0)
    const dy = der(1)
    const len = Math.hypot(dx, dy) || 1
    out.push({
      x: pos(0),
      y: pos(1),
      nx: -dy / len,
      ny: dx / len,
      w: p1[2] + (p2[2] - p1[2]) * t,
    })
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < steps; k++) push(i, k / steps)
  if (!closed) push(segs - 1, 1)
  return out
}

const poly = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${r1(p.x)} ${r1(p.y)}`).join("L")

/** Smooth fill through the centreline. */
export function fillPath(pts: readonly P[], closed = true): string {
  return `M${poly(samples(pts, closed))}${closed ? "Z" : ""}`
}

/**
 * Calligraphic ribbon around the centreline. Open strokes taper with their
 * end widths; closed ones are a ring (use fillRule="evenodd").
 */
export function inkPath(pts: readonly P[], closed = false): string {
  const sm = samples(pts, closed)
  const left = sm.map((p) => ({ x: p.x + (p.nx * p.w) / 2, y: p.y + (p.ny * p.w) / 2 }))
  const right = sm.map((p) => ({ x: p.x - (p.nx * p.w) / 2, y: p.y - (p.ny * p.w) / 2 }))
  if (closed) return `M${poly(left)}ZM${poly(right)}Z`
  return `M${poly(left)}L${poly(right.reverse())}Z`
}

export const mirror = (pts: readonly P[], axis: number): P[] =>
  pts.map(([x, y, w]) => [2 * axis - x, y, w] as const)

/** Wobbly ring: a circle with per-point jitter, thin top-left → thick bottom-right. */
export function ring(cx: number, cy: number, r: number, jitter: number[], wMin: number, wMax: number): P[] {
  return jitter.map((j, i) => {
    const a = (i / jitter.length) * Math.PI * 2 - Math.PI * 0.75
    const rr = r + j
    // light from top-left: widest at the bottom-right (a ≈ π/4)
    const shade = (1 - Math.cos(a - Math.PI / 4)) / 2
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a), wMin + (wMax - wMin) * shade] as const
  })
}

export const Ink = ({ d, closed, fill = INK }: { d: readonly P[]; closed?: boolean; fill?: string }) => (
  <path d={inkPath(d, closed)} fill={fill} fillRule={closed ? "evenodd" : undefined} />
)

/**
 * Shared defs: hand-wobble + paper-grain filters, screentone + hatch
 * patterns. Render once per document region (ids are stable; duplicates
 * are harmless — the first wins and they're identical).
 */
export function InkDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
      <defs>
        <filter id="hw-wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="7" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="hw-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0" result="g" />
          <feComposite in="g" in2="SourceGraphic" operator="in" result="gi" />
          <feBlend in="SourceGraphic" in2="gi" mode="multiply" />
        </filter>
        <pattern id="hw-tone" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.75" fill={INK} />
        </pattern>
        <pattern id="hw-tone-pale" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.75" fill={PALE} />
        </pattern>
        <pattern id="hw-hatch" width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
          <rect width="0.9" height="3.5" fill={INK} />
        </pattern>
      </defs>
    </svg>
  )
}

/* ---- Face parts ------------------------------------------------------- */

/** Tall oval eye: thick upper lid, big iris, two highlights, thin lower line. */
export function Eye({ cx, cy, rx, ry, ink = INK, iris = ink }: { cx: number; cy: number; rx: number; ry: number; ink?: string; iris?: string }) {
  const lid: P[] = [
    [cx - rx * 1.05, cy - ry * 0.1, 0.4],
    [cx - rx * 0.5, cy - ry * 0.95, rx * 0.42],
    [cx + rx * 0.4, cy - ry * 0.95, rx * 0.4],
    [cx + rx * 1.05, cy - ry * 0.05, 0.4],
  ]
  const lower: P[] = [
    [cx - rx * 0.95, cy + ry * 0.2, 0.3],
    [cx, cy + ry * 1.0, rx * 0.18],
    [cx + rx * 0.95, cy + ry * 0.25, 0.3],
  ]
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" />
      <ellipse cx={cx + rx * 0.08} cy={cy + ry * 0.12} rx={rx * 0.62} ry={ry * 0.68} fill={iris} />
      <ellipse cx={cx - rx * 0.22} cy={cy - ry * 0.3} rx={rx * 0.26} ry={ry * 0.22} fill="#fff" />
      <circle cx={cx + rx * 0.3} cy={cy + ry * 0.4} r={rx * 0.12} fill="#fff" />
      <Ink d={lid} fill={ink} />
      <Ink d={lower} fill={ink} />
    </>
  )
}

/** Eyebrow drawn outside the head line, tapered both ends. */
export const Brow = ({ x1, y1, x2, y2, w = 2.2, ink = INK }: { x1: number; y1: number; x2: number; y2: number; w?: number; ink?: string }) => (
  <Ink d={[[x1, y1, 0.4], [(x1 + x2) / 2, (y1 + y2) / 2 - 1.2, w], [x2, y2, 0.5]]} fill={ink} />
)

/** Cheek blush: three short hatch lines. */
export const Blush = ({ x, y, ink = INK }: { x: number; y: number; ink?: string }) => (
  <>
    {[0, 1, 2].map((i) => (
      <Ink key={i} d={[[x + i * 3, y + 3, 0.3], [x + i * 3 + 2.4, y - 2, 1.0], [x + i * 3 + 3.2, y - 3.6, 0.3]]} fill={ink} />
    ))}
  </>
)

export const Sweat = ({ x, y }: { x: number; y: number }) => (
  <>
    <path d={`M${x} ${y}c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z`} fill="#8ad3ff" />
    <Ink d={[[x - 0.5, y + 1, 0.4], [x - 3.6, y + 7, 1.4], [x - 1, y + 12, 1.2], [x + 3, y + 10, 0.9], [x + 3.4, y + 6, 0.4]]} />
  </>
)

/** Open mouth with one tooth and a tongue. */
export function Mouth({ cx, cy, w, h }: { cx: number; cy: number; w: number; h: number }) {
  const lip: P[] = [
    [cx - w * 0.5, cy - h * 0.05, 0.9],
    [cx - w * 0.25, cy - h * 0.5, 1.4],
    [cx + w * 0.25, cy - h * 0.5, 1.5],
    [cx + w * 0.5, cy - h * 0.05, 1.8],
    [cx + w * 0.28, cy + h * 0.5, 2.2],
    [cx - w * 0.28, cy + h * 0.5, 1.8],
  ]
  return (
    <>
      <path d={fillPath(lip)} fill={INK} />
      <path d={`M${cx - w * 0.22} ${cy + h * 0.1}q${w * 0.22} ${h * 0.55} ${w * 0.46} 0z`} fill={TONGUE} />
      <path d={`M${cx - w * 0.12} ${cy - h * 0.4}h${w * 0.16}v${h * 0.3}h-${w * 0.16}z`} fill="#fff" />
      <Ink d={lip} closed />
    </>
  )
}

/* ---- Ghost ------------------------------------------------------------ */

const GHOST_BODY: P[] = [
  [30, 16, 1.3], [46, 7, 1.2], [62, 11, 1.5], [74, 24, 2.0], [80, 44, 2.9], [83, 66, 3.5], [81, 86, 3.7],
  [62, 86, 3.0], [42, 86, 2.6], [22, 86, 2.4], [16, 66, 1.9], [16, 44, 1.5], [22, 26, 1.3],
]
// Two hem frames (the sheet flaps): fill + ink each, toggled by CSS.
const HEM_A: P[] = [[82, 82, 3.6], [80, 98, 3.4], [70, 90, 3.0], [60, 104, 3.0], [48, 92, 2.8], [36, 104, 2.6], [26, 92, 2.4], [18, 100, 2.2]]
const HEM_B: P[] = [[82, 82, 3.6], [78, 102, 3.4], [68, 92, 3.0], [58, 102, 3.0], [46, 94, 2.8], [34, 102, 2.6], [24, 94, 2.4], [18, 98, 2.2]]
const hemFill = (hem: P[]) => fillPath([[18, 80, 0], [82, 80, 0], ...hem.slice(1)])
const GHOST_ARM_L: P[] = [[18, 48, 0.8], [10, 46, 1.4], [4, 38, 1.8], [6, 30, 1.6], [12, 34, 1.2], [16, 42, 0.8]]
const GHOST_ARM_R: P[] = [[80, 44, 0.8], [86, 38, 1.4], [90, 28, 1.8], [88, 22, 1.4], [84, 26, 1.0], [82, 36, 0.8]]

export function Ghost(props: Props) {
  const body = fillPath(GHOST_BODY)
  return (
    <svg viewBox="0 0 96 116" {...props}>
      <clipPath id="hw-ghost-clip">
        <path d={body} />
      </clipPath>
      <g className={s.paint} transform="translate(1.1 0.8)" filter="url(#hw-grain)">
        <path d={fillPath(GHOST_ARM_L)} fill="#f6f1ff" />
        <path d={fillPath(GHOST_ARM_R)} fill="#f6f1ff" />
        <path d={body} fill="#f6f1ff" />
        <g className={s.hemA}><path d={hemFill(HEM_A)} fill="#f6f1ff" /></g>
        <g className={s.hemB}><path d={hemFill(HEM_B)} fill="#f6f1ff" /></g>
        <g clipPath="url(#hw-ghost-clip)">
          <path d="M66 8C80 22 88 50 84 90H96V4z" fill="#d9ccf0" />
          <path d="M66 8C80 22 88 50 84 90H96V4z" fill="url(#hw-tone)" opacity="0.3" />
          <path d="M76 18C86 36 88 62 84 90H96V12z" fill="#b9a6dc" />
          <path d="M84 34C90 52 90 72 86 90H96V30z" fill="url(#hw-hatch)" opacity="0.5" />
          <path d="M20 20C16 34 16 56 20 80c-3-20-3-42 0-60z" fill="#fff" />
        </g>
        <path d="M60 74l12-3 3 11-12 3z" fill="#e4d6ff" />
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        <Ink d={GHOST_BODY} closed />
        <g className={s.hemA}><Ink d={HEM_A} /></g>
        <g className={s.hemB}><Ink d={HEM_B} /></g>
        {/* arms (ink only on the outer edge: the body line covers the join) */}
        <Ink d={GHOST_ARM_L.slice(0, 5)} />
        <Ink d={GHOST_ARM_R.slice(0, 5)} />
        {/* folds */}
        <Ink d={[[40, 30, 0.3], [37, 50, 1.1], [41, 72, 0.3]]} />
        <Ink d={[[62, 38, 0.3], [66, 58, 1.2], [62, 76, 0.3]]} />
        {/* patch + stitches */}
        <Ink d={[[60, 74, 0.6], [72, 71, 1.0], [75, 82, 1.2], [63, 85, 0.9], [60, 74, 0.6]]} />
        {[[63, 73], [68, 72], [63, 84], [69, 83]].map(([x, y]) => (
          <Ink key={`${x}${y}`} d={[[x, y - 2, 0.3], [x + 1, y + 1, 0.9], [x + 2, y + 3, 0.3]]} />
        ))}
        {/* face: one eye bigger */}
        <Brow x1={27} y1={31} x2={40} y2={29} />
        <Brow x1={50} y1={22} x2={66} y2={25} w={2.6} />
        <g className={s.blink}>
          <Eye cx={34} cy={45} rx={6} ry={8.5} />
          <Eye cx={58} cy={41} rx={8} ry={11.5} />
        </g>
        <Blush x={20} y={58} />
        <Blush x={68} y={56} />
        <Mouth cx={46} cy={65} w={14} h={10} />
      </g>
    </svg>
  )
}

/** Hand-lettered "BOO!" with speed lines, for beside the ghost. */
export function Boo(props: Props) {
  return (
    <svg viewBox="0 0 120 64" {...props}>
      <g className={s.ink} filter="url(#hw-wobble)">
        {/* speed lines */}
        <Ink d={[[6, 20, 0.3], [20, 18, 1.4], [30, 16, 0.3]]} />
        <Ink d={[[4, 32, 0.3], [18, 32, 1.6], [30, 31, 0.3]]} />
        <Ink d={[[8, 44, 0.3], [22, 42, 1.3], [32, 40, 0.3]]} />
        {/* B */}
        <Ink d={[[40, 10, 1.2], [38, 30, 4.2], [40, 50, 2.4]]} />
        <Ink d={[[38, 11, 0.6], [52, 8, 3.0], [56, 20, 3.4], [42, 29, 1.6]]} />
        <Ink d={[[42, 29, 1.4], [58, 32, 3.6], [57, 46, 3.6], [40, 50, 1.6]]} />
        {/* O O */}
        <Ink d={[[72, 14, 2.0], [64, 30, 3.8], [72, 48, 3.0], [82, 30, 1.8], [73, 13, 2.0]]} />
        <Ink d={[[96, 12, 2.0], [88, 30, 3.8], [96, 48, 3.0], [106, 30, 1.8], [97, 11, 2.0]]} />
        {/* ! */}
        <Ink d={[[114, 8, 3.6], [113, 36, 1.4]]} />
        <circle cx="113" cy="46" r="2.8" fill={INK} />
      </g>
    </svg>
  )
}

/* ---- Pumpkin ---------------------------------------------------------- */

const PUMP: P[] = [
  [40, 36, 1.5], [58, 31, 1.3], [72, 34, 1.3], [90, 30, 1.5], [108, 38, 2.1], [122, 54, 2.7], [126, 74, 3.3],
  [120, 96, 3.7], [104, 110, 3.9], [80, 116, 3.9], [56, 116, 3.5], [34, 108, 3.1], [18, 90, 2.5], [14, 68, 1.9], [20, 48, 1.5],
]

// Stem, leaf and arms share one point list for fill AND ink so they register.
const STEM: P[] = [[60, 38, 1.0], [58, 24, 1.3], [66, 10, 1.6], [76, 6, 1.2], [80, 14, 2.0], [76, 26, 2.2], [72, 38, 1.4]]
const LEAF: P[] = [[78, 18, 0.8], [88, 10, 1.3], [102, 10, 1.4], [110, 16, 1.8], [100, 22, 2.0], [88, 22, 1.6]]
const ARM_L: P[] = [[16, 72, 1.0], [20, 84, 1.6], [34, 94, 2.0], [50, 98, 2.4], [52, 106, 2.6], [40, 104, 2.4], [24, 94, 2.0], [14, 80, 1.4]]
const ARM_R: P[] = [[124, 76, 1.0], [120, 88, 1.8], [106, 98, 2.4], [90, 102, 2.6], [88, 110, 2.8], [100, 108, 2.6], [116, 98, 2.2], [126, 84, 1.6]]

export function Pumpkin(props: Props) {
  const body = fillPath(PUMP)
  return (
    <svg viewBox="0 0 140 126" {...props}>
      <clipPath id="hw-pump-clip">
        <path d={body} />
      </clipPath>
      <g className={s.paint} transform="translate(1.2 0.9)" filter="url(#hw-grain)">
        <path d={fillPath(STEM)} fill="#4caf50" />
        <path d="M70 30c2-8 5-16 8-20-1 8-3 14-6 20z" fill="#2f7d35" />
        <path d={fillPath(LEAF)} fill="#7ed957" />
        <path d="M90 20c6-4 12-5 18-3-6 2-12 3-18 3z" fill="#4caf50" />
        <path d={body} fill="#ff8c1a" />
        <g clipPath="url(#hw-pump-clip)">
          <path d="M70 40C100 50 118 70 112 120H140V30z" fill="#e0661a" />
          <path d="M70 40C100 50 118 70 112 120H140V30z" fill="url(#hw-tone)" opacity="0.28" />
          <path d="M98 60C118 76 122 96 116 120H140V50z" fill="#b84a10" />
          <path d="M112 84C122 96 122 108 118 120H140V80z" fill="url(#hw-hatch)" opacity="0.55" />
          <path d="M22 50C30 40 44 34 60 32c-14 4-26 10-34 22z" fill="#ffd199" />
        </g>
        {/* arms, hands on belly */}
        <path d={fillPath(ARM_L)} fill="#ff8c1a" />
        <path d={fillPath(ARM_R)} fill="#e0661a" />
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        <Ink d={PUMP} closed />
        {/* ribs */}
        <Ink d={[[52, 36, 0.3], [42, 72, 1.5], [50, 112, 0.3]]} />
        <Ink d={[[88, 34, 0.3], [97, 72, 1.8], [90, 114, 0.3]]} />
        <Ink d={[[70, 36, 0.3], [68, 76, 0.9], [72, 114, 0.3]]} />
        {/* cracks + dent */}
        <Ink d={[[106, 84, 0.3], [110, 91, 1.1], [105, 98, 1.0], [110, 105, 0.3]]} />
        <Ink d={[[26, 56, 0.3], [30, 60, 0.9], [27, 64, 0.3]]} />
        <Ink d={[[112, 62, 0.3], [116, 66, 0.8], [113, 70, 0.3]]} />
        {/* stem + leaf + tendril */}
        <Ink d={STEM} closed />
        <Ink d={LEAF} closed />
        <Ink d={[[82, 18, 0.3], [94, 15, 0.8], [106, 15, 0.3]]} />
        <Ink d={[[82, 10, 0.3], [84, 2, 1.0], [90, 4, 0.3]]} />
        {/* arms + mitten creases */}
        <Ink d={ARM_L} closed />
        <Ink d={ARM_R} closed />
        <Ink d={[[44, 98, 0.3], [47, 102, 0.9], [44, 106, 0.3]]} />
        <Ink d={[[96, 102, 0.3], [93, 106, 0.9], [96, 110, 0.3]]} />
        {/* face */}
        <Brow x1={42} y1={50} x2={60} y2={54} w={2.6} />
        <Brow x1={80} y1={50} x2={98} y2={46} w={2.8} />
        <g className={s.blink}>
          <Eye cx={53} cy={68} rx={7} ry={10} />
          <Eye cx={88} cy={64} rx={8} ry={11.5} />
        </g>
        <Blush x={30} y={80} />
        <Blush x={108} y={76} />
        <Mouth cx={72} cy={92} w={34} h={18} />
        <Sweat x={124} y={36} />
      </g>
    </svg>
  )
}

/* ---- Bat -------------------------------------------------------------- */

const WING_L: P[] = [
  [48, 30, 1.2], [34, 18, 1.3], [16, 12, 1.5], [5, 18, 2.0], [10, 28, 2.6], [6, 38, 3.0], [18, 33, 2.5], [24, 42, 3.0],
  [34, 37, 2.6], [40, 46, 3.0], [48, 42, 2.4],
]
const WING_R = mirror(WING_L, 64)
const BAT_BODY: P[] = [[56, 22, 1.2], [70, 20, 1.2], [80, 30, 2.1], [82, 44, 3.0], [74, 56, 3.4], [58, 58, 3.2], [46, 48, 2.6], [46, 34, 1.6]]
const EAR_L: P[] = [[54, 24, 1.2], [50, 6, 1.6], [64, 18, 2.0]]
const EAR_R: P[] = [[72, 20, 1.2], [82, 5, 1.4], [80, 26, 2.2]]
const RIBS_L: P[][] = [
  [[46, 32, 0.3], [30, 22, 1.0], [16, 14, 0.3]],
  [[46, 36, 0.3], [26, 32, 1.0], [10, 30, 0.3]],
  [[48, 40, 0.3], [34, 38, 0.9], [24, 42, 0.3]],
]

/** Body + face only (also used upside-down, tangled in the cobweb). */
function BatBodyPaint() {
  return (
    <>
      <path d={fillPath(EAR_L)} fill="#8b5cf6" />
      <path d={fillPath(EAR_R)} fill="#8b5cf6" />
      <path d="M55 20l-2-9 7 6z" fill="#ff8fb8" />
      <path d="M73 18l6-9-1 10z" fill="#ff8fb8" />
      <path d={fillPath(BAT_BODY)} fill="#8b5cf6" />
      <path d="M70 22c12 8 12 24 4 34 6-10 4-24-4-34z" fill="#6d3fd1" />
      <path d="M78 36c6 8 4 16-2 20 4-6 4-12 2-20z" fill="url(#hw-tone)" opacity="0.3" />
    </>
  )
}
function BatBodyInk({ ink = INK }: { ink?: string }) {
  return (
    <>
      <Ink d={EAR_L} closed fill={ink} />
      <Ink d={EAR_R} closed fill={ink} />
      <Ink d={BAT_BODY} closed fill={ink} />
      <Brow x1={52} y1={26} x2={62} y2={28} w={2} ink={ink} />
      <Brow x1={68} y1={26} x2={78} y2={23} w={2.2} ink={ink} />
      <g className={s.blink}>
        <Eye cx={58} cy={37} rx={5} ry={7.5} ink={ink} />
        <Eye cx={72} cy={35} rx={6} ry={9} ink={ink} />
      </g>
      <Blush x={48} y={44} ink={ink} />
      <Blush x={78} y={42} ink={ink} />
      <Ink d={[[56, 48, 0.3], [64, 53, 1.4], [72, 48, 0.3]]} fill={ink} />
      <path d="M59 48l2 4 2-4z" fill="#fff" />
      <path d="M64 50q2 6 4 0z" fill={TONGUE} />
    </>
  )
}

export function Bat(props: Props) {
  return (
    <svg viewBox="0 0 128 64" {...props}>
      <g className={s.paint} transform="translate(1 0.8)" filter="url(#hw-grain)">
        <g className={s.wingL}><path d={fillPath(WING_L)} fill="#8b5cf6" /><path d="M8 24c8 10 20 16 38 16-14 2-28-2-38-16z" fill="#6d3fd1" /></g>
        <g className={s.wingR}><path d={fillPath(WING_R)} fill="#8b5cf6" /><path d="M120 24c-8 10-20 16-38 16 14 2 28-2 38-16z" fill="#6d3fd1" /></g>
        <BatBodyPaint />
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        <g className={s.wingL}>
          <Ink d={WING_L} closed />
          {RIBS_L.map((d, i) => <Ink key={i} d={d} />)}
        </g>
        <g className={s.wingR}>
          <Ink d={WING_R} closed />
          {RIBS_L.map((d, i) => <Ink key={i} d={mirror(d, 64)} />)}
        </g>
        <BatBodyInk />
      </g>
    </svg>
  )
}

/* ---- Moon ------------------------------------------------------------- */

const MOON = ring(60, 60, 50, [2, -1, 3, 0, -2, 2, 1, -3, 2, 0, -1, 3, -2, 1], 1.3, 3.6)
const CRATERS: [number, number, number, number][] = [[34, 40, 9, 7], [52, 84, 6, 5], [86, 32, 5, 4], [40, 70, 4, 3.5], [70, 98, 4, 3]]

export function Moon(props: Props) {
  const body = fillPath(MOON)
  return (
    <svg viewBox="0 0 120 120" {...props}>
      <clipPath id="hw-moon-clip">
        <path d={body} />
      </clipPath>
      <g className={s.paint} transform="translate(1 0.8)" filter="url(#hw-grain)">
        <path d={body} fill="#ffe066" />
        <g clipPath="url(#hw-moon-clip)">
          <path d="M70 6C100 30 104 80 76 114H120V0z" fill="#f0c33c" />
          <path d="M70 6C100 30 104 80 76 114H120V0z" fill="url(#hw-tone)" opacity="0.25" />
          <path d="M92 16C112 40 110 80 90 112H120V10z" fill="#d9a521" />
          <path d="M104 36C114 56 112 84 100 110H120V30z" fill="url(#hw-hatch)" opacity="0.5" />
          <path d="M22 30C14 44 14 70 24 90c-6-20-6-40-2-60z" fill="#fff6c2" />
          {CRATERS.map(([cx, cy, rx, ry]) => (
            <ellipse key={cx + cy} cx={cx + 1} cy={cy + 1} rx={rx} ry={ry} fill="#f0c33c" />
          ))}
        </g>
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        <Ink d={MOON} closed />
        {CRATERS.map(([cx, cy, rx, ry]) => (
          <g key={cx + cy}>
            <Ink d={[[cx - rx, cy + ry * 0.3, 0.3], [cx - rx * 0.3, cy - ry, 0.9], [cx + rx * 0.7, cy - ry * 0.7, 0.3]]} />
            <Ink d={[[cx + rx, cy - ry * 0.3, 0.3], [cx + rx * 0.3, cy + ry, 1.6], [cx - rx * 0.7, cy + ry * 0.7, 0.3]]} />
          </g>
        ))}
        {/* sleepy face on the side */}
        <Ink d={[[72, 50, 0.4], [79, 45, 2.4], [86, 50, 0.4]]} />
        <Ink d={[[90, 54, 0.4], [97, 49, 2.4], [104, 54, 0.4]]} />
        <Ink d={[[80, 66, 0.4], [88, 72, 1.8], [98, 66, 0.4]]} />
        <Blush x={66} y={60} />
        <Blush x={98} y={62} />
      </g>
    </svg>
  )
}

/* ---- Cloud ------------------------------------------------------------ */

const CLOUD: P[] = [
  [14, 58, 1.2], [10, 44, 1.2], [24, 34, 1.3], [36, 20, 1.2], [58, 14, 1.2], [78, 22, 1.4], [92, 16, 1.4], [112, 24, 1.8],
  [126, 40, 2.4], [130, 58, 3.0], [118, 66, 3.2], [96, 68, 3.0], [70, 66, 3.0], [44, 68, 3.0], [24, 66, 2.6],
]

export function Cloud(props: Props) {
  const body = fillPath(CLOUD)
  return (
    <svg viewBox="0 0 140 80" {...props}>
      <clipPath id="hw-cloud-clip">
        <path d={body} />
      </clipPath>
      <g className={s.paint} transform="translate(1 0.8)" filter="url(#hw-grain)">
        <path d={body} fill="#fff" />
        <g clipPath="url(#hw-cloud-clip)">
          <path d="M8 50C40 56 90 56 134 48V80H8z" fill="#d9ccf0" />
          <path d="M8 56C40 62 90 62 134 56V80H8z" fill="url(#hw-tone)" opacity="0.3" />
        </g>
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        <Ink d={CLOUD} closed />
        <Ink d={[[40, 44, 0.3], [56, 40, 0.9], [70, 44, 0.3]]} />
      </g>
    </svg>
  )
}

/* ---- Town ------------------------------------------------------------- */

type House = { x: number; w: number; h: number; roof: string; tank?: boolean; jit: number }
const HOUSES: House[] = [
  { x: 8, w: 46, h: 38, roof: "#ff6fae", jit: 2 },
  { x: 60, w: 36, h: 54, roof: "#ffd166", jit: -2 },
  { x: 102, w: 54, h: 32, roof: "#ff6fae", tank: true, jit: 1 },
  { x: 164, w: 38, h: 46, roof: "#7ed957", jit: -1 },
  { x: 208, w: 48, h: 36, roof: "#ffd166", jit: 2 },
  { x: 262, w: 36, h: 58, roof: "#ff6fae", jit: -2 },
  { x: 304, w: 32, h: 30, roof: "#7ed957", jit: 1 },
]
const GROUND = 90

function houseShape(h: House): { wall: P[]; roof: P[]; windows: [number, number][] } {
  const top = GROUND - h.h
  const mid = h.x + h.w / 2
  const wall: P[] = [
    [h.x + h.jit, top, 1.2], [h.x + h.w - h.jit, top + 1, 1.4], [h.x + h.w + 1, GROUND, 3.2], [h.x - 1, GROUND, 2.4],
  ]
  const roof: P[] = [
    [h.x - 6, top + 3, 1.2], [h.x + h.w * 0.25, top - 10 + h.jit, 1.4], [mid, top - 22, 1.6],
    [h.x + h.w * 0.75, top - 10 - h.jit, 2.4], [h.x + h.w + 6, top + 3, 3.2],
  ]
  const rows = Math.max(1, Math.floor((h.h - 10) / 18))
  const windows: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    const y = top + 12 + r * 18
    if (h.w > 40) windows.push([mid - 10, y], [mid + 10, y])
    else windows.push([mid, y])
  }
  return { wall, roof, windows }
}

/** Little round-roofed town on a hill: lumpy roofs, lit windows, a riveted water tank, grass. */
export function Skyline(props: Props) {
  const shapes = HOUSES.map(houseShape)
  const tankX = 118
  const tankTop = GROUND - 32 - 22 - 26
  return (
    <svg viewBox="0 0 360 110" {...props}>
      <g className={s.paint} transform="translate(1 0.8)" filter="url(#hw-grain)">
        {shapes.map(({ wall, roof, windows }, i) => (
          <g key={i}>
            <path d={fillPath(wall)} fill="#6d4bb5" />
            <path d={`M${HOUSES[i].x + HOUSES[i].w * 0.62} ${GROUND - HOUSES[i].h}h${HOUSES[i].w * 0.38}V${GROUND}h-${HOUSES[i].w * 0.38}z`} fill="#55399a" />
            <path d={fillPath(roof)} fill={HOUSES[i].roof} />
            {windows.map(([wx, wy]) => (
              <rect key={wx + wy} x={wx - 5} y={wy - 6} width="10" height="12" rx="2" fill="#ffe066" />
            ))}
          </g>
        ))}
        {/* water tank on the wide house */}
        <rect x={tankX} y={tankTop} width="26" height="22" rx="3" fill="#a9b4c8" />
        <rect x={tankX + 16} y={tankTop} width="10" height="22" fill="#7d8aa3" />
        <path d={`M${tankX - 3} ${tankTop}h32l-4-8h-24z`} fill="#55399a" />
        {/* hill */}
        <path d={`M0 ${GROUND}C60 ${GROUND - 4} 300 ${GROUND - 4} 360 ${GROUND}v20H0z`} fill="#4caf50" />
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        {shapes.map(({ wall, roof, windows }, i) => (
          <g key={i}>
            <Ink d={wall} closed />
            <Ink d={roof} />
            {/* chimney */}
            <Ink d={[[HOUSES[i].x + HOUSES[i].w * 0.7, GROUND - HOUSES[i].h - 6, 0.4], [HOUSES[i].x + HOUSES[i].w * 0.7, GROUND - HOUSES[i].h - 20, 1.2], [HOUSES[i].x + HOUSES[i].w * 0.7 + 7, GROUND - HOUSES[i].h - 21, 1.0], [HOUSES[i].x + HOUSES[i].w * 0.7 + 7, GROUND - HOUSES[i].h - 8, 0.4]]} />
            {windows.map(([wx, wy]) => (
              <g key={wx + wy}>
                <Ink d={[[wx - 5, wy - 6, 0.6], [wx + 5, wy - 6, 0.8], [wx + 5, wy + 6, 1.4], [wx - 5, wy + 6, 1.0], [wx - 5, wy - 6, 0.6]]} />
                <Ink d={[[wx, wy - 5, 0.3], [wx, wy, 0.7], [wx, wy + 5, 0.3]]} />
                <Ink d={[[wx - 4, wy, 0.3], [wx, wy, 0.7], [wx + 4, wy, 0.3]]} />
              </g>
            ))}
          </g>
        ))}
        {/* tank: legs, seams, rivets */}
        <Ink d={[[tankX - 2, tankTop + 1, 0.8], [tankX + 28, tankTop, 1.0], [tankX + 28, tankTop + 22, 1.8], [tankX - 2, tankTop + 23, 1.4], [tankX - 2, tankTop + 1, 0.8]]} />
        <Ink d={[[tankX - 3, tankTop - 1, 0.4], [tankX + 1, tankTop - 8, 1.0], [tankX + 25, tankTop - 8, 1.0], [tankX + 29, tankTop - 1, 0.4]]} />
        <Ink d={[[tankX, tankTop + 11, 0.3], [tankX + 13, tankTop + 11.5, 0.8], [tankX + 26, tankTop + 11, 0.3]]} />
        {[2, 8, 14, 20].map((dy) => (
          <g key={dy}>
            <circle cx={tankX + 2.5} cy={tankTop + dy + 1} r="1.1" fill={INK} />
            <circle cx={tankX + 23.5} cy={tankTop + dy + 1} r="1.1" fill={INK} />
          </g>
        ))}
        {/* hill line, grass tufts, fence */}
        <Ink d={[[-2, GROUND + 1, 1.0], [90, GROUND - 3, 2.2], [200, GROUND - 2, 2.6], [300, GROUND - 3, 2.2], [362, GROUND + 1, 1.0]]} />
        {[20, 58, 99, 158, 204, 258, 300, 342].map((gx) => (
          <g key={gx}>
            <Ink d={[[gx, GROUND - 1, 0.3], [gx - 2, GROUND - 6, 1.0], [gx - 3, GROUND - 10, 0.3]]} />
            <Ink d={[[gx + 2, GROUND - 1, 0.3], [gx + 3, GROUND - 7, 1.0], [gx + 3, GROUND - 12, 0.3]]} />
            <Ink d={[[gx + 4, GROUND - 1, 0.3], [gx + 7, GROUND - 5, 0.9], [gx + 9, GROUND - 8, 0.3]]} />
          </g>
        ))}
        {/* doodled signature mark */}
        <Ink d={[[338, 102, 0.4], [333, 98, 1.2], [336, 104, 1.0], [331, 107, 0.4]]} />
        <Ink d={[[348, 98, 0.4], [342, 101, 1.2], [344, 107, 1.0], [350, 106, 0.4]]} />
        <Ink d={[[353, 100, 0.3], [355, 104, 0.8], [356, 108, 0.3]]} />
      </g>
    </svg>
  )
}

/* ---- Cobweb + spider + tangled bat (pale ink on the dark header) ------- */

function Spider({ ink }: { ink: string }) {
  const body: P[] = [[78, 40, 1.0], [86, 44, 1.6], [88, 54, 2.2], [80, 60, 2.4], [70, 56, 2.0], [69, 46, 1.2]]
  const legsL: P[][] = [
    [[72, 46, 1.6], [64, 41, 1.0], [60, 46, 0.3]],
    [[70, 50, 1.6], [62, 50, 1.0], [58, 55, 0.3]],
    [[70, 54, 1.6], [63, 58, 1.0], [62, 63, 0.3]],
    [[72, 57, 1.6], [68, 63, 1.0], [69, 68, 0.3]],
  ]
  return (
    <g className={s.spider}>
      <g className={s.paint} transform="translate(0.8 0.6)">
        <path d={fillPath(body)} fill="#ff6fae" />
        <path d="M84 44c5 6 4 14-2 18 3-6 3-12 2-18z" fill="#c9407f" />
        <path d="M80 50c4 4 4 10 1 13 2-4 2-9-1-13z" fill="url(#hw-hatch)" opacity="0.5" />
      </g>
      <g className={s.ink}>
        <g className={s.legsL}>{legsL.map((d, i) => <Ink key={i} d={d} fill={ink} />)}</g>
        <g className={s.legsR}>{legsL.map((d, i) => <Ink key={i} d={mirror(d, 78.5)} fill={ink} />)}</g>
        <Ink d={body} closed fill={ink} />
        <Brow x1={72} y1={42} x2={78} y2={41} w={1.6} ink={ink} />
        <Brow x1={80} y1={40} x2={86} y2={42} w={1.6} ink={ink} />
        <g className={s.blink}>
          <Eye cx={75} cy={49} rx={3} ry={4.2} ink={ink} />
          <Eye cx={82} cy={48} rx={3.6} ry={5} ink={ink} />
        </g>
        <Ink d={[[75, 56, 0.3], [78.5, 58, 1.0], [82, 56, 0.3]]} fill={ink} />
      </g>
    </g>
  )
}

/**
 * Corner cobweb anchored at the top-right (100,0): spokes fan left/down and
 * each ring sags toward the corner. A pink spider dangles from it and a bat
 * has got itself tangled upside-down in the lower strands.
 */
export function Cobweb({ ink = PALE, ...props }: Props & { ink?: string }) {
  const spokes = 6
  const rings = [22, 42, 64, 88]
  const angles = Array.from({ length: spokes }, (_, i) => Math.PI / 2 + (i * (Math.PI / 2)) / (spokes - 1))
  const pt = (r: number, a: number) => [100 + r * Math.cos(a), r * Math.sin(a)] as const
  const spokeStrokes: P[][] = angles.map((a) => {
    const [x, y] = pt(104, a)
    const [mx, my] = pt(50, a)
    return [[100, 0, 1.4], [mx, my, 0.9], [x, y, 0.3]]
  })
  const ringStrokes: P[][] = rings.map((r) => {
    const out: P[] = []
    angles.forEach((a, i) => {
      if (i > 0) {
        const mid = (angles[i - 1] + a) / 2
        const [cx, cy] = pt(r * 0.86, mid)
        out.push([cx, cy, 0.5])
      }
      const [x, y] = pt(r, a)
      out.push([x, y, 1.0])
    })
    return out
  })
  // strands wrapping the tangled bat
  const wraps: P[][] = [
    [[14, 66, 0.3], [38, 72, 1.0], [64, 68, 0.3]],
    [[18, 78, 0.3], [42, 82, 1.0], [66, 78, 0.3]],
    [[26, 56, 0.3], [40, 60, 0.9], [58, 58, 0.3]],
  ]
  return (
    <svg viewBox="0 0 100 100" {...props}>
      <g className={s.ink} fill={ink}>
        {spokeStrokes.map((d, i) => <Ink key={`s${i}`} d={d} fill={ink} />)}
        {ringStrokes.map((d, i) => <Ink key={`r${i}`} d={d} fill={ink} />)}
        <Ink d={[[78, 0, 0.3], [78.5, 20, 0.8], [78, 38, 0.3]]} fill={ink} />
      </g>
      {/* tangled bat: upside-down, wings pinned, sweat drop + "!" */}
      <g className={s.tangled}>
        <g transform="translate(72 92) rotate(165) scale(0.5)">
          <g className={s.paint} filter="url(#hw-grain)">
            <path d={fillPath(WING_L)} fill="#8b5cf6" />
            <path d={fillPath(WING_R)} fill="#8b5cf6" />
            <BatBodyPaint />
          </g>
          <g className={s.ink}>
            <Ink d={WING_L} closed fill={ink} />
            <Ink d={WING_R} closed fill={ink} />
            <BatBodyInk ink={ink} />
          </g>
        </g>
        <g fill={ink}>
          {wraps.map((d, i) => <Ink key={i} d={d} fill={ink} />)}
          <Ink d={[[10, 56, 2.6], [11, 68, 1.0]]} fill={ink} />
          <circle cx="11.5" cy="73" r="1.8" fill={ink} />
          <path d="M58 76c-2 3-3 5-3 6.5a3 3 0 0 0 6 0c0-1.5-1-3.5-3-6.5z" fill="#8ad3ff" />
        </g>
      </g>
      <Spider ink={ink} />
    </svg>
  )
}

/** Convenience wrapper so callers can place any mascot with the shared defs. */
export function WithInkDefs({ children }: { children: ReactNode }) {
  return (
    <>
      <InkDefs />
      {children}
    </>
  )
}
