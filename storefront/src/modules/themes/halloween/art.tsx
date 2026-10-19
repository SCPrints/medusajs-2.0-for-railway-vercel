import type { SVGProps } from "react"

import s from "./halloween.module.css"

// Original vector mascots for the Halloween theme, drawn in code — no images.
// Style: chubby "super-deformed" proportions, big round eyes with highlights,
// one thick ink outline everywhere, flat fills + a single shadow tone each,
// candy colours. Friendly, never spooky. Colours are literal on purpose:
// decorations don't follow brand tokens.

type Props = SVGProps<SVGSVGElement>

const INK = "#1f1235"
const CHEEK = "#ff8fb8"
const TONGUE = "#ff5c8a"

const line = {
  stroke: INK,
  strokeLinejoin: "round",
  strokeLinecap: "round",
} as const

/** Big round eye: white, ink pupil, highlight. Wrap a pair in `.blink`. */
function Eye({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="#fff" {...line} strokeWidth={r * 0.32} />
      <circle cx={cx} cy={cy + r * 0.12} r={r * 0.52} fill={INK} />
      <circle cx={cx - r * 0.22} cy={cy - r * 0.22} r={r * 0.2} fill="#fff" />
    </>
  )
}

export function Ghost(props: Props) {
  return (
    <svg viewBox="0 0 80 100" {...props}>
      {/* stubby arms (under the body so only the nubs show) */}
      <ellipse cx="7" cy="52" rx="8" ry="5.5" fill="#fff" {...line} strokeWidth="3" transform="rotate(-28 7 52)" />
      <g className={s.wave}>
        <ellipse cx="73" cy="50" rx="8" ry="5.5" fill="#fff" {...line} strokeWidth="3" transform="rotate(32 73 50)" />
      </g>
      {/* body: round head, wavy skirt */}
      <path
        d="M40 4C59 4 72 19 72 38v38c-5 8-11 8-16 0-5 8-11 8-16 0-5 8-11 8-16 0-5 8-11 8-16 0V38C8 19 21 4 40 4z"
        fill="#fff"
        {...line}
        strokeWidth="3.5"
      />
      {/* shadow tone */}
      <path d="M54 22c10 10 12 34 8 50-2 4-6 4-8 1 6-14 6-36 0-51z" fill="#dcd0f5" />
      <g className={s.blink}>
        <Eye cx={30} cy={40} r={7} />
        <Eye cx={50} cy={40} r={7} />
      </g>
      <ellipse cx="19" cy="52" rx="4" ry="2.5" fill={CHEEK} />
      <ellipse cx="61" cy="52" rx="4" ry="2.5" fill={CHEEK} />
      {/* open grin + tongue */}
      <path d="M29 55q11 14 22 0z" fill={INK} {...line} strokeWidth="2.5" />
      <path d="M35 58q5 7 10 0z" fill={TONGUE} />
    </svg>
  )
}

export function Pumpkin(props: Props) {
  return (
    <svg viewBox="0 0 124 114" {...props}>
      {/* stem, leaf, curl */}
      <path d="M56 32c-3-10 1-19 7-26 5 4 7 11 7 20l-4 6z" fill="#4caf50" {...line} strokeWidth="3" />
      <path d="M68 22c6-9 17-9 24-2-7 5-15 7-24 2z" fill="#7ed957" {...line} strokeWidth="3" />
      <path d="M76 20q7-9 10 1" fill="none" stroke="#4caf50" strokeWidth="3" strokeLinecap="round" />
      {/* arms (under the body so only the mitten + forearm show) */}
      <path d="M32 72c-10 2-17-3-22-12" fill="none" {...line} strokeWidth="5" />
      <circle cx="9" cy="58" r="6.5" fill="#ff8c1a" {...line} strokeWidth="3" />
      <g className={s.wave}>
        <path d="M92 72c10 2 17-3 22-12" fill="none" {...line} strokeWidth="5" />
        <circle cx="115" cy="58" r="6.5" fill="#ff8c1a" {...line} strokeWidth="3" />
      </g>
      {/* body: side lobes, then the front lobe over them */}
      <ellipse cx="34" cy="70" rx="27" ry="36" fill="#ff8c1a" {...line} strokeWidth="3.5" />
      <ellipse cx="90" cy="70" rx="27" ry="36" fill="#ff8c1a" {...line} strokeWidth="3.5" />
      <ellipse cx="62" cy="70" rx="33" ry="39" fill="#ff8c1a" {...line} strokeWidth="3.5" />
      {/* shadow tone */}
      <path d="M30 94c8 11 56 11 64 0-6 10-16 13-32 13s-26-3-32-13z" fill="#e0661a" />
      <g className={s.blink}>
        <Eye cx={46} cy={62} r={8.5} />
        <Eye cx={78} cy={62} r={8.5} />
      </g>
      <ellipse cx="30" cy="74" rx="4.5" ry="2.8" fill="#ff6a6a" />
      <ellipse cx="94" cy="74" rx="4.5" ry="2.8" fill="#ff6a6a" />
      {/* big grin, one tooth, tongue */}
      <path d="M36 78q26 24 52 0z" fill={INK} {...line} strokeWidth="3" />
      <path d="M52 79h9v6h-9z" fill="#fff" />
      <path d="M50 88q12 11 24 0z" fill={TONGUE} />
    </svg>
  )
}

const WING =
  "M42 28C34 14 20 8 4 12c3 6 3 12 0 18 4-4 8-4 12-1 4-4 8-4 12 0 3-3 7-3 10 1 2-1 3-1 4-2z"

export function Bat(props: Props) {
  return (
    <svg viewBox="0 0 96 56" {...props}>
      <g className={s.wingL}>
        <path d={WING} fill="#8b5cf6" {...line} strokeWidth="3" />
      </g>
      {/* mirrored wing: the SVG transform sits on the outer group so the CSS
          flap transform on the inner group doesn't override it */}
      <g transform="translate(96 0) scale(-1 1)">
        <g className={s.wingR}>
          <path d={WING} fill="#8b5cf6" {...line} strokeWidth="3" />
        </g>
      </g>
      <g className={s.batBody}>
        {/* ears */}
        <path d="M40 20l-3-13 11 7z" fill="#8b5cf6" {...line} strokeWidth="3" />
        <path d="M56 20l3-13-11 7z" fill="#8b5cf6" {...line} strokeWidth="3" />
        <path d="M41 17l-1-5 4 3z" fill={CHEEK} />
        <path d="M55 17l1-5-4 3z" fill={CHEEK} />
        <circle cx="48" cy="31" r="14" fill="#8b5cf6" {...line} strokeWidth="3" />
        <path d="M51 20c7 6 8 17 3 23 3-8 2-17-3-23z" fill="#6d3fd1" />
        <g className={s.blink}>
          <Eye cx={43} cy={29} r={5} />
          <Eye cx={53} cy={29} r={5} />
        </g>
        <ellipse cx="38" cy="35" rx="2.5" ry="1.6" fill={CHEEK} />
        <ellipse cx="58" cy="35" rx="2.5" ry="1.6" fill={CHEEK} />
        {/* cheeky grin, one fang, tongue out */}
        <path d="M42 37q6 6 12 0" fill="none" {...line} strokeWidth="2.2" />
        <path d="M44 38l1.8 3.4 1.8-3.4z" fill="#fff" />
        <path d="M48.5 39.5q2 6 4 0z" fill={TONGUE} />
      </g>
    </svg>
  )
}

export function Moon(props: Props) {
  return (
    <svg viewBox="0 0 100 100" {...props}>
      <circle cx="50" cy="50" r="47" fill={INK} />
      <circle cx="50" cy="50" r="43" fill="#f5c842" />
      <circle cx="47" cy="47" r="43" fill="#ffe066" />
      {/* flat craters */}
      <g fill="#f5c842">
        <circle cx="30" cy="30" r="6" />
        <circle cx="70" cy="26" r="4" />
        <circle cx="24" cy="62" r="4" />
        <circle cx="68" cy="70" r="6" />
      </g>
      {/* sleepy smile */}
      <path d="M34 48q6-6 12 0M54 48q6-6 12 0" fill="none" {...line} strokeWidth="3.5" />
      <path d="M40 60q10 10 20 0" fill="none" {...line} strokeWidth="3.5" />
      <ellipse cx="30" cy="56" rx="4" ry="2.4" fill={CHEEK} />
      <ellipse cx="70" cy="56" rx="4" ry="2.4" fill={CHEEK} />
    </svg>
  )
}

const CLOUD_PUFFS: [number, number, number][] = [
  [28, 40, 18],
  [54, 30, 24],
  [84, 38, 20],
  [60, 46, 17],
]

/** Puffy cloud: outline circles, shadow circles, then lighter circles nudged up. */
export function Cloud(props: Props) {
  return (
    <svg viewBox="0 0 120 70" {...props}>
      {CLOUD_PUFFS.map(([cx, cy, r]) => (
        <circle key={`o${cx}`} cx={cx} cy={cy} r={r + 4.5} fill={INK} />
      ))}
      {CLOUD_PUFFS.map(([cx, cy, r]) => (
        <circle key={`s${cx}`} cx={cx} cy={cy} r={r} fill="#dcd0f5" />
      ))}
      {CLOUD_PUFFS.map(([cx, cy, r]) => (
        <circle key={`h${cx}`} cx={cx} cy={cy - 4} r={r} fill="#fff" />
      ))}
    </svg>
  )
}

type House = { x: number; w: number; h: number; roof: string; windows: [number, number][] }

const HOUSES: House[] = [
  { x: 6, w: 44, h: 36, roof: "#ff6fae", windows: [[20, 54], [36, 54]] },
  { x: 56, w: 34, h: 50, roof: "#ffd166", windows: [[73, 40], [73, 58]] },
  { x: 96, w: 50, h: 30, roof: "#ff6fae", windows: [[112, 60], [130, 60]] },
  { x: 152, w: 36, h: 44, roof: "#7ed957", windows: [[170, 46], [170, 62]] },
  { x: 194, w: 46, h: 34, roof: "#ffd166", windows: [[208, 56], [226, 56]] },
  { x: 246, w: 34, h: 54, roof: "#ff6fae", windows: [[263, 36], [263, 54]] },
  { x: 286, w: 30, h: 28, roof: "#7ed957", windows: [[301, 62]] },
]

/** Little round-roofed town, candy coloured, sitting on a hill line. */
export function Skyline(props: Props) {
  const ground = 76
  return (
    <svg viewBox="0 0 320 84" {...props}>
      {HOUSES.map((h) => {
        const top = ground - h.h
        const mid = h.x + h.w / 2
        return (
          <g key={h.x}>
            <rect x={h.x} y={top} width={h.w} height={h.h} fill="#6d4bb5" {...line} strokeWidth="3" />
            <rect x={mid + h.w * 0.2} y={top - 14} width="7" height="16" fill="#6d4bb5" {...line} strokeWidth="3" />
            <path
              d={`M${h.x - 5} ${top + 2}Q${mid} ${top - 26} ${h.x + h.w + 5} ${top + 2}z`}
              fill={h.roof}
              {...line}
              strokeWidth="3"
            />
            {h.windows.map(([wx, wy]) => (
              <circle key={wx + wy} cx={wx} cy={wy} r="4.5" fill="#ffe066" {...line} strokeWidth="2.2" />
            ))}
          </g>
        )
      })}
      <path d={`M-4 ${ground}h328`} {...line} strokeWidth="3.5" />
    </svg>
  )
}

/**
 * Corner cobweb anchored at the top-right (100,0): spokes fan left/down and
 * each ring sags toward the corner. Generated so the geometry stays tidy.
 * A round candy-pink spider with wobbly legs dangles from it.
 */
export function Cobweb(props: Props) {
  const spokes = 6
  const rings = [22, 42, 64, 88]
  const angles = Array.from(
    { length: spokes },
    (_, i) => Math.PI / 2 + (i * (Math.PI / 2)) / (spokes - 1)
  )
  const pt = (r: number, a: number) =>
    [100 + r * Math.cos(a), r * Math.sin(a)] as const
  const round = (n: number) => Math.round(n * 10) / 10

  const spokePaths = angles.map((a) => {
    const [x, y] = pt(104, a)
    return `M100 0L${round(x)} ${round(y)}`
  })
  const ringPaths = rings.map((r) => {
    let d = ""
    angles.forEach((a, i) => {
      const [x, y] = pt(r, a)
      if (i === 0) {
        d += `M${round(x)} ${round(y)}`
        return
      }
      const mid = (angles[i - 1] + a) / 2
      const [cx, cy] = pt(r * 0.86, mid)
      d += `Q${round(cx)} ${round(cy)} ${round(x)} ${round(y)}`
    })
    return d
  })

  // Four legs per side: ink outline stroke under a pink stroke.
  const legsL = "M70 44l-6-4-3 4M70 47l-7 0-2 4M71 50l-6 3 0 4M72 52l-4 5 1 4"
  const legsR = "M86 44l6-4 3 4M86 47l7 0 2 4M85 50l6 3 0 4M84 52l4 5-1 4"
  const leg = (d: string) => (
    <>
      <path d={d} fill="none" {...line} strokeWidth="3.2" />
      <path d={d} fill="none" stroke="#ff6fae" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )

  return (
    <svg viewBox="0 0 100 100" fill="none" {...props}>
      <g stroke="#f8f1ff" strokeWidth="1.2" strokeLinecap="round">
        {spokePaths.map((d) => (
          <path key={d} d={d} />
        ))}
        {ringPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d="M78 0v36" stroke="#f8f1ff" strokeWidth="0.9" />
      <g className={s.spider}>
        <g className={s.legsL}>{leg(legsL)}</g>
        <g className={s.legsR}>{leg(legsR)}</g>
        <circle cx="78" cy="48" r="9" fill="#ff6fae" {...line} strokeWidth="2.4" />
        <path d="M82 40c5 4 5 12 1 16 2-5 1-11-1-16z" fill="#e0498a" />
        <g className={s.blink}>
          <Eye cx={74.5} cy={46.5} r={3.4} />
          <Eye cx={81.5} cy={46.5} r={3.4} />
        </g>
        <path d="M75 52.5q3 3 6 0" fill="none" {...line} strokeWidth="1.6" />
      </g>
    </svg>
  )
}
