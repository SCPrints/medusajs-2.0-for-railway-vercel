import type { SVGProps } from "react"

import s from "./halloween.module.css"

// Original vector artwork for the Halloween theme — drawn in code, no images.
// Colours are literal on purpose: decorations don't follow brand tokens.

type Props = SVGProps<SVGSVGElement>

export function Bat(props: Props) {
  return (
    <svg viewBox="0 0 64 32" fill="#1e1029" {...props}>
      <g className={s.wingL}>
        <path d="M30 14C25 7 15 4 3 8c5 2 7 6 6 10 4-3 8-2 10 2 3-4 7-4 11-2z" />
      </g>
      <g className={s.wingR}>
        <path d="M34 14c5-7 15-10 27-6-5 2-7 6-6 10-4-3-8-2-10 2-3-4-7-4-11-2z" />
      </g>
      <ellipse cx="32" cy="17" rx="4.5" ry="6.5" />
      <path d="M28.5 12.5 29.5 7l2.5 3.5L34.5 7l1 5.5z" />
      <circle cx="30.4" cy="14.2" r="0.9" fill="#fb923c" />
      <circle cx="33.6" cy="14.2" r="0.9" fill="#fb923c" />
    </svg>
  )
}

export function Moon(props: Props) {
  return (
    <svg viewBox="0 0 100 100" {...props}>
      <defs>
        <radialGradient id="scp-hw-moon" cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="70%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f5c56b" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#scp-hw-moon)" />
      <g fill="#d6a64a" opacity="0.35">
        <circle cx="34" cy="36" r="9" />
        <circle cx="62" cy="58" r="12" />
        <circle cx="40" cy="70" r="5" />
        <circle cx="66" cy="28" r="4" />
      </g>
    </svg>
  )
}

export function Ghost(props: Props) {
  return (
    <svg viewBox="0 0 60 72" {...props}>
      <path
        d="M30 2C15 2 6 13 6 28v38l6-5 6 6 6-6 6 6 6-6 6 6 6-6 6 5V28C54 13 45 2 30 2z"
        fill="#f8f1ff"
        stroke="#d8c9ec"
        strokeWidth="1.5"
      />
      <ellipse cx="22" cy="28" rx="3.6" ry="5" fill="#1e1029" />
      <ellipse cx="38" cy="28" rx="3.6" ry="5" fill="#1e1029" />
      <ellipse cx="30" cy="42" rx="4" ry="5.5" fill="#1e1029" />
      <ellipse cx="15" cy="36" rx="3" ry="1.8" fill="#f9a8d4" opacity="0.6" />
      <ellipse cx="45" cy="36" rx="3" ry="1.8" fill="#f9a8d4" opacity="0.6" />
    </svg>
  )
}

export function JackOLantern(props: Props) {
  return (
    <svg viewBox="0 0 120 108" {...props}>
      {/* stem + leaf */}
      <path d="M57 20c0-8 2-14 7-18l5 3c-4 4-5 9-5 15z" fill="#4d7c0f" />
      <path d="M66 12c8-6 18-5 22 1-7 2-14 2-22-1z" fill="#65a30d" />
      {/* body: overlapping ribs */}
      <ellipse cx="38" cy="64" rx="30" ry="40" fill="#c2410c" />
      <ellipse cx="82" cy="64" rx="30" ry="40" fill="#c2410c" />
      <ellipse cx="60" cy="64" rx="30" ry="42" fill="#ea580c" />
      <ellipse cx="48" cy="64" rx="14" ry="40" fill="#f97316" opacity="0.55" />
      <ellipse cx="72" cy="64" rx="14" ry="40" fill="#f97316" opacity="0.55" />
      {/* carved face: dark cut, then flickering inner glow */}
      <g fill="#431407">
        <path d="M30 52l12-14 12 14z" />
        <path d="M66 52l12-14 12 14z" />
        <path d="M54 66l6-9 6 9z" />
        <path d="M28 76c10 12 54 12 64 0l-6 2-4 7-6-6-6 6-6-6-6 6-6-6-6 6-4-7z" />
      </g>
      <g className={s.pumpkinGlow} fill="#fde047">
        <path d="M33 50l9-10 9 10z" />
        <path d="M69 50l9-10 9 10z" />
        <path d="M56 64l4-6 4 6z" />
        <path d="M33 79c10 8 44 8 54 0l-3 2-3 4-5-4-5 4-5-4-5 4-5-4-5 4-5-4-3-4z" />
      </g>
    </svg>
  )
}

/**
 * Corner cobweb anchored at the top-right (100,0): spokes fan left/down and
 * each ring sags toward the corner. Generated so the geometry stays tidy.
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

  return (
    <svg viewBox="0 0 100 100" fill="none" {...props}>
      <g stroke="#f8f1ff" strokeWidth="0.9" strokeLinecap="round">
        {spokePaths.map((d) => (
          <path key={d} d={d} />
        ))}
        {ringPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className={s.spider}>
        <path d="M78 0v34" stroke="#f8f1ff" strokeWidth="0.6" />
        <g fill="#f8f1ff">
          <circle cx="78" cy="38" r="3.4" />
          <circle cx="78" cy="33.6" r="2.2" />
        </g>
        <g stroke="#f8f1ff" strokeWidth="0.8" strokeLinecap="round">
          <path d="M75 36l-4-2-2 2M75 39l-5 0-2 3M81 36l4-2 2 2M81 39l5 0 2 3" />
        </g>
      </g>
    </svg>
  )
}
