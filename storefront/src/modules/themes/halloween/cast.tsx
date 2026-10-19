import type { ReactNode, SVGProps } from "react"

import { Blush, Brow, Eye, INK, Ink, Mouth, Sweat, TONGUE, fillPath, mirror, type P } from "./art"
import s from "./halloween.module.css"

/*
 * The extended Halloween cast — original print-shop monsters drawn with the
 * same manga-ink + cel-paint technique as art.tsx (calligraphic ribbons,
 * wobble filter, grain, two shadow tones, screentone, hatch, rim light,
 * misregistered paint). Each has a Toriyama-style face and a pose with
 * weight. Registered in mascot.tsx. No third-party characters.
 */

type Props = SVGProps<SVGSVGElement>
type Box = [x: number, y: number, w: number, h: number]

/** Standard two-layer figure: misregistered grained paint under wobbled ink. */
function Fig({ viewBox, paint, ink, ...props }: Props & { viewBox: string; paint: ReactNode; ink: ReactNode }) {
  return (
    <svg viewBox={viewBox} {...props}>
      <g className={s.paint} transform="translate(1.1 0.8)" filter="url(#hw-grain)">
        {paint}
      </g>
      <g className={s.ink} filter="url(#hw-wobble)">
        {ink}
      </g>
    </svg>
  )
}

/** Two shadow tones + screentone + hatch (+ rim light) clipped to a shape. */
function Shade({ id, d, box: [x, y, w, h], t1, t2, light }: { id: string; d: string; box: Box; t1: string; t2: string; light?: string }) {
  const c1 = `M${x + w * 0.5} ${y - 4}C${x + w * 0.85} ${y + h * 0.25} ${x + w * 0.9} ${y + h * 0.7} ${x + w * 0.55} ${y + h + 4}H${x + w + 6}V${y - 4}z`
  const c2 = `M${x + w * 0.72} ${y + h * 0.12}C${x + w * 0.96} ${y + h * 0.4} ${x + w * 0.96} ${y + h * 0.75} ${x + w * 0.72} ${y + h + 4}H${x + w + 6}V${y + h * 0.1}z`
  const c3 = `M${x + w * 0.86} ${y + h * 0.4}C${x + w * 1.02} ${y + h * 0.6} ${x + w} ${y + h * 0.82} ${x + w * 0.88} ${y + h + 4}H${x + w + 6}V${y + h * 0.35}z`
  const rim = `M${x + w * 0.1} ${y + h * 0.15}C${x + w * 0.01} ${y + h * 0.4} ${x + w * 0.02} ${y + h * 0.7} ${x + w * 0.14} ${y + h * 0.9}C${x + w * 0.07} ${y + h * 0.65} ${x + w * 0.07} ${y + h * 0.4} ${x + w * 0.1} ${y + h * 0.15}z`
  return (
    <>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <path d={c1} fill={t1} />
        <path d={c1} fill="url(#hw-tone)" opacity="0.28" />
        <path d={c2} fill={t2} />
        <path d={c3} fill="url(#hw-hatch)" opacity="0.5" />
        {light ? <path d={rim} fill={light} /> : null}
      </g>
    </>
  )
}

/** Short stitch ticks along a run of points. */
const Stitches = ({ pts, ink = INK }: { pts: [number, number][]; ink?: string }) => (
  <>
    {pts.map(([x, y]) => (
      <Ink key={`${x}-${y}`} d={[[x - 1.5, y - 2, 0.3], [x, y, 0.9], [x + 1.5, y + 2.2, 0.3]]} fill={ink} />
    ))}
  </>
)

/* ---- Skeleton in an oversized "SC" hoodie --------------------------- */

const HOOD: P[] = [[34, 42, 1.2], [46, 18, 1.4], [66, 8, 1.4], [88, 14, 1.6], [102, 38, 2.2], [100, 64, 2.8], [70, 68, 2.4], [42, 64, 2.0]]
const SKULL: P[] = [[46, 30, 1.2], [64, 22, 1.2], [82, 28, 1.5], [90, 46, 2.0], [86, 64, 2.6], [70, 72, 2.8], [52, 70, 2.4], [42, 52, 1.8]]
const HOODIE: P[] = [[20, 80, 1.4], [44, 70, 1.4], [66, 72, 1.6], [90, 70, 1.8], [112, 84, 2.4], [116, 130, 3.2], [100, 142, 3.4], [30, 142, 3.0], [12, 128, 2.6]]
const SLEEVE_L: P[] = [[14, 86, 1.2], [4, 122, 2.0], [12, 148, 2.8], [30, 146, 2.4], [32, 110, 1.6]]
const SLEEVE_R = mirror(SLEEVE_L, 64)
const HOODIE_BLUE = "#5b8def"

export function Skeleton(props: Props) {
  const hoodie = fillPath(HOODIE)
  return (
    <Fig
      viewBox="0 0 130 160"
      paint={
        <>
          <path d={fillPath(HOOD)} fill="#4a74d6" />
          <path d={fillPath(SKULL)} fill="#f6f1ff" />
          <Shade id="hw-sk-skull" d={fillPath(SKULL)} box={[42, 22, 48, 50]} t1="#d9ccf0" t2="#b9a6dc" light="#fff" />
          <ellipse cx="58" cy="48" rx="9" ry="12" fill="#2b1b45" />
          <ellipse cx="78" cy="46" rx="10" ry="13" fill="#2b1b45" />
          <path d={hoodie} fill={HOODIE_BLUE} />
          <Shade id="hw-sk-body" d={hoodie} box={[12, 70, 104, 72]} t1="#3f63c4" t2="#2d4a9c" light="#8fb1ff" />
          <path d={fillPath(SLEEVE_L)} fill={HOODIE_BLUE} />
          <path d={fillPath(SLEEVE_R)} fill="#3f63c4" />
          {/* chest print, slightly off-register on purpose */}
          <g transform="translate(1.5 1)">
            <path d={fillPath([[72, 94, 0], [58, 92, 0], [56, 104, 0], [70, 106, 0], [68, 116, 0], [54, 114, 0]], false)} fill="none" />
          </g>
          <path d="M54 92h42v26H54z" fill="#ff6fae" opacity="0.18" />
        </>
      }
      ink={
        <>
          <Ink d={HOOD} closed />
          <Ink d={SKULL} closed />
          {/* jaw + teeth */}
          <Ink d={[[50, 62, 0.4], [60, 70, 1.4], [78, 70, 1.6], [86, 60, 0.4]]} />
          <Stitches pts={[[60, 69], [66, 71], [72, 71], [78, 69]]} />
          {/* nose */}
          <Ink d={[[66, 54, 0.3], [68, 59, 1.2], [71, 54, 0.3]]} />
          <g className={s.blink}>
            <Eye cx={58} cy={49} rx={6} ry={8} />
            <Eye cx={78} cy={47} rx={7} ry={9.5} />
          </g>
          <Brow x1={48} y1={34} x2={64} y2={33} w={2.4} />
          <Brow x1={72} y1={31} x2={88} y2={34} w={2.6} />
          <Blush x={44} y={60} />
          <Blush x={84} y={58} />
          <Mouth cx={68} cy={66} w={12} h={7} />
          <Ink d={HOODIE} closed />
          <Ink d={SLEEVE_L} closed />
          <Ink d={SLEEVE_R} closed />
          {/* bony fingers out of the sleeves */}
          <Stitches pts={[[14, 150], [20, 152], [26, 151]]} />
          <Stitches pts={[[102, 151], [108, 152], [114, 150]]} />
          {/* drawstrings + pocket */}
          <Ink d={[[58, 76, 0.3], [56, 92, 0.8], [58, 104, 0.3]]} />
          <Ink d={[[72, 76, 0.3], [74, 90, 0.8], [72, 100, 0.3]]} />
          <Ink d={[[30, 126, 0.3], [64, 130, 1.4], [100, 126, 0.3]]} />
          {/* "SC" chest print */}
          <g fill="#ff2e63">
            <Ink d={[[72, 96, 1.6], [60, 94, 2.6], [58, 102, 2.4], [70, 106, 2.4], [68, 116, 2.6], [56, 114, 1.6]]} fill="#ff2e63" />
            <Ink d={[[96, 96, 1.6], [82, 94, 2.6], [78, 105, 2.8], [84, 116, 2.6], [96, 114, 1.6]]} fill="#ff2e63" />
          </g>
        </>
      }
      {...props}
    />
  )
}

/* ---- Witch with an ink cauldron ------------------------------------- */

const BRIM: P[] = [[18, 54, 1.4], [48, 44, 1.2], [78, 44, 1.6], [102, 56, 2.4], [76, 66, 2.6], [46, 66, 2.2]]
const CONE: P[] = [[42, 50, 1.2], [52, 24, 1.4], [60, 8, 1.6], [74, 4, 1.4], [70, 16, 1.6], [78, 50, 2.4]]
const WFACE: P[] = [[44, 56, 1.2], [62, 50, 1.2], [78, 56, 1.6], [82, 72, 2.2], [72, 88, 2.6], [52, 88, 2.2], [42, 72, 1.8]]
const DRESS: P[] = [[46, 86, 1.2], [76, 86, 1.6], [92, 138, 3.0], [30, 140, 2.6]]
const WARM: P[] = [[76, 96, 1.2], [96, 104, 1.6], [112, 100, 1.8], [114, 108, 1.8], [96, 113, 1.6], [78, 108, 1.4]]
const POT: P[] = [[104, 98, 1.4], [152, 98, 1.8], [158, 114, 2.6], [150, 140, 3.2], [112, 142, 3.0], [100, 116, 2.2]]

export function Witch(props: Props) {
  const pot = fillPath(POT)
  const dress = fillPath(DRESS)
  return (
    <Fig
      viewBox="0 0 170 150"
      paint={
        <>
          <path d={fillPath(CONE)} fill="#5b3a9b" />
          <path d={fillPath(WFACE)} fill="#c7a6ff" />
          <Shade id="hw-wi-face" d={fillPath(WFACE)} box={[42, 50, 40, 38]} t1="#a685e6" t2="#8463c9" light="#eadcff" />
          <path d={fillPath(BRIM)} fill="#5b3a9b" />
          <path d="M44 50c10-4 24-4 34 0l-2 6c-10-3-20-3-30 0z" fill="#ffd166" />
          <path d={dress} fill="#5b3a9b" />
          <Shade id="hw-wi-dress" d={dress} box={[30, 86, 62, 54]} t1="#472c7d" t2="#36205f" />
          <path d={fillPath(WARM)} fill="#c7a6ff" />
          {/* fire */}
          <path d="M112 142c2-8 6-12 8-18 2 6 6 10 8 16 2-6 4-10 8-14 2 8 4 12 2 18z" fill="#ff8c1a" />
          <path d="M118 142c1-5 3-8 5-11 2 4 3 7 4 11z" fill="#ffd166" />
          <path d={pot} fill="#3b2a5a" />
          <Shade id="hw-wi-pot" d={pot} box={[100, 98, 58, 44]} t1="#2b1b45" t2="#1f1235" light="#6a55a0" />
          <ellipse cx="130" cy="100" rx="25" ry="6" fill="#1f1235" />
          {/* ink bubbles, two frames */}
          <g className={s.fA}>
            <circle cx="122" cy="90" r="4" fill="#1f1235" />
            <circle cx="138" cy="84" r="3" fill="#1f1235" />
            <circle cx="120" cy="88" r="1" fill="#fff" />
          </g>
          <g className={s.fB}>
            <circle cx="126" cy="80" r="3.5" fill="#1f1235" />
            <circle cx="136" cy="92" r="2.5" fill="#1f1235" />
            <circle cx="124.5" cy="78.5" r="1" fill="#fff" />
          </g>
        </>
      }
      ink={
        <>
          <Ink d={CONE} closed />
          <Ink d={BRIM} closed />
          <Ink d={[[44, 56, 0.3], [62, 52, 0.8], [78, 56, 0.3]]} />
          <Ink d={WFACE} closed />
          {/* hair strands */}
          <Ink d={[[44, 62, 0.4], [38, 74, 1.4], [40, 86, 0.3]]} />
          <Ink d={[[80, 60, 0.4], [86, 72, 1.4], [84, 84, 0.3]]} />
          <Brow x1={48} y1={60} x2={60} y2={58} w={2.2} />
          <Brow x1={66} y1={56} x2={78} y2={60} w={2.4} />
          <g className={s.blink}>
            <Eye cx={55} cy={69} rx={5.5} ry={8} />
            <Eye cx={70} cy={67} rx={6.5} ry={9} />
          </g>
          <Blush x={42} y={78} />
          <Blush x={74} y={76} />
          <Mouth cx={62} cy={81} w={13} h={8} />
          <Ink d={DRESS} closed />
          <Ink d={WARM} closed />
          {/* ladle */}
          <Ink d={[[108, 104, 1.2], [122, 92, 1.8], [132, 86, 1.0]]} />
          <Ink d={[[130, 84, 0.6], [138, 86, 2.4], [136, 92, 2.0], [130, 90, 0.6]]} />
          <Ink d={POT} closed />
          <Ink d={[[104, 100, 0.6], [130, 94, 1.2], [156, 100, 0.6]]} />
          {/* legs */}
          <Ink d={[[112, 142, 0.4], [110, 148, 1.4]]} />
          <Ink d={[[148, 140, 0.4], [150, 148, 1.4]]} />
          <g className={s.fA}><Ink d={[[118, 90, 0.4], [122, 86, 1.0], [126, 90, 0.4]]} /></g>
          <g className={s.fB}><Ink d={[[122, 80, 0.4], [126, 76, 1.0], [130, 80, 0.4]]} /></g>
        </>
      }
      {...props}
    />
  )
}

/* ---- Black cat in a delivery box ------------------------------------ */

const BOX_FRONT: P[] = [[22, 72, 1.4], [116, 70, 1.6], [122, 122, 3.0], [18, 124, 2.6]]
const BOX_SIDE: P[] = [[116, 70, 1.2], [140, 58, 1.6], [144, 110, 2.6], [122, 122, 2.4]]
const FLAP_L: P[] = [[22, 72, 1.2], [6, 46, 1.6], [40, 42, 1.4], [48, 70, 1.2]]
const FLAP_R: P[] = [[92, 68, 1.2], [128, 34, 1.6], [142, 50, 2.0], [116, 70, 1.4]]
const CAT_HEAD: P[] = [[48, 36, 1.2], [62, 26, 1.2], [78, 26, 1.3], [92, 38, 1.8], [94, 58, 2.4], [80, 72, 2.8], [58, 72, 2.4], [46, 56, 1.8]]
const EAR_L: P[] = [[50, 38, 1.2], [46, 12, 1.6], [64, 28, 1.6]]
const EAR_R: P[] = [[90, 38, 1.2], [96, 12, 1.4], [78, 28, 1.6]]
const CAT = "#2b1b45"

export function CatInBox(props: Props) {
  return (
    <Fig
      viewBox="0 0 150 130"
      paint={
        <>
          <path d={fillPath(FLAP_L)} fill="#e0ad73" />
          <path d={fillPath(FLAP_R)} fill="#c9955a" />
          <path d={fillPath(EAR_L)} fill={CAT} />
          <path d={fillPath(EAR_R)} fill={CAT} />
          <path d="M52 36l-2-16 12 12z" fill="#ff8fb8" />
          <path d="M88 36l4-16-12 12z" fill="#ff8fb8" />
          <path d={fillPath(CAT_HEAD)} fill={CAT} />
          <Shade id="hw-cat-head" d={fillPath(CAT_HEAD)} box={[46, 26, 48, 46]} t1="#1f1235" t2="#140b24" light="#4a3570" />
          {/* paws on the box edge */}
          <ellipse cx="56" cy="74" rx="8" ry="4" fill={CAT} />
          <ellipse cx="84" cy="73" rx="8" ry="4" fill={CAT} />
          <path d={fillPath(BOX_FRONT)} fill="#d9a066" />
          <Shade id="hw-cat-box" d={fillPath(BOX_FRONT)} box={[18, 70, 104, 54]} t1="#c08a52" t2="#a8703e" light="#ecc08c" />
          <path d={fillPath(BOX_SIDE)} fill="#b8824a" />
          {/* tape */}
          <path d="M64 70l6 54h8l-6-54z" fill="#f0d8b0" />
          {/* tail over the edge */}
          <path d={fillPath([[118, 98, 0], [128, 90, 0], [136, 76, 0], [132, 66, 0], [138, 66, 0], [142, 78, 0], [134, 94, 0], [122, 104, 0]])} fill={CAT} />
        </>
      }
      ink={
        <>
          <Ink d={FLAP_L} closed />
          <Ink d={FLAP_R} closed />
          <Ink d={EAR_L} closed />
          <Ink d={EAR_R} closed />
          <Ink d={CAT_HEAD} closed />
          <Brow x1={52} y1={40} x2={64} y2={38} w={2.2} ink="#f8f1ff" />
          <Brow x1={74} y1={38} x2={88} y2={42} w={2.4} ink="#f8f1ff" />
          <g className={s.blink}>
            <Eye cx={60} cy={50} rx={6} ry={9} iris="#8bd450" />
            <Eye cx={80} cy={49} rx={7} ry={10} iris="#8bd450" />
          </g>
          <Blush x={46} y={60} ink="#ff8fb8" />
          <Blush x={86} y={58} ink="#ff8fb8" />
          {/* nose + whiskers */}
          <path d="M68 58l4 4 4-4z" fill="#ff8fb8" />
          <Ink d={[[66, 62, 0.3], [70, 66, 1.2], [74, 62, 0.3]]} fill="#f8f1ff" />
          <Ink d={[[52, 60, 0.3], [40, 58, 0.9], [30, 58, 0.3]]} fill="#f8f1ff" />
          <Ink d={[[52, 64, 0.3], [40, 66, 0.9], [30, 68, 0.3]]} fill="#f8f1ff" />
          <Ink d={[[88, 60, 0.3], [100, 58, 0.9], [110, 58, 0.3]]} fill="#f8f1ff" />
          <Ink d={[[88, 64, 0.3], [100, 66, 0.9], [110, 68, 0.3]]} fill="#f8f1ff" />
          <Ink d={BOX_FRONT} closed />
          <Ink d={BOX_SIDE} closed />
          <Ink d={[[64, 72, 0.4], [68, 98, 0.9], [70, 122, 0.4]]} />
          <Ink d={[[72, 72, 0.4], [76, 98, 0.9], [78, 122, 0.4]]} />
          {/* "this way up" doodle on the side */}
          <Ink d={[[132, 84, 0.3], [133, 72, 1.2], [134, 64, 0.3]]} />
          <Ink d={[[128, 70, 0.3], [133, 63, 1.0], [138, 70, 0.3]]} />
          <Ink d={[[30, 112, 0.3], [40, 110, 0.9], [52, 112, 0.3]]} />
          <Ink d={[[30, 116, 0.3], [38, 114, 0.9], [46, 116, 0.3]]} />
          <Ink d={[[118, 98, 0.6], [128, 90, 1.6], [136, 76, 1.8], [132, 66, 2.0], [138, 66, 1.4], [142, 78, 2.0], [134, 94, 2.4], [122, 104, 1.0]]} />
        </>
      }
      {...props}
    />
  )
}

/* ---- Mummy wrapped in DTF transfer film ----------------------------- */

const MUM: P[] = [[40, 20, 1.2], [62, 10, 1.2], [84, 20, 1.5], [96, 56, 2.2], [100, 110, 3.0], [90, 148, 3.4], [60, 154, 3.4], [30, 148, 3.0], [20, 110, 2.4], [24, 56, 1.6]]
const MARM_L: P[] = [[24, 70, 1.2], [4, 78, 1.6], [4, 92, 2.0], [26, 88, 1.8]]
const MARM_R: P[] = [[96, 68, 1.2], [116, 76, 1.6], [116, 90, 2.0], [94, 86, 1.8]]
const TAIL_A: P[] = [[96, 104, 1.6], [112, 96, 1.8], [118, 82, 2.0], [116, 70, 1.2]]
const TAIL_B: P[] = [[96, 104, 1.6], [112, 108, 1.8], [120, 118, 2.0], [122, 130, 1.2]]
const BANDS: [number, number, number, number][] = [[22, 30, 94, 40], [22, 62, 98, 72], [24, 90, 100, 100], [26, 118, 96, 128], [28, 140, 90, 148]]

export function Mummy(props: Props) {
  const body = fillPath(MUM)
  return (
    <Fig
      viewBox="0 0 130 160"
      paint={
        <>
          <path d={fillPath(MARM_L)} fill="#eaf3ff" />
          <path d={fillPath(MARM_R)} fill="#d6e8ff" />
          <path d={body} fill="#eaf3ff" />
          <g clipPath="url(#hw-mum-clip)">
            {BANDS.map(([x1, y1, x2, y2]) => (
              <path key={y1} d={`M${x1} ${y1}L${x2} ${y2}l0 7L${x1} ${y1 + 7}z`} fill="#bfe0ff" opacity="0.7" />
            ))}
            {/* eye gap */}
            <path d="M30 44C50 38 80 38 98 46l-2 12C70 52 50 52 30 56z" fill="#9fb8d8" />
          </g>
          <Shade id="hw-mum-clip" d={body} box={[20, 10, 80, 144]} t1="#cfe0f5" t2="#afc6e2" light="#fff" />
          {/* loose end, two frames */}
          <g className={s.fA}><path d={fillPath([...TAIL_A, [114, 74, 0], [108, 88, 0], [100, 98, 0]])} fill="#dcecff" /></g>
          <g className={s.fB}><path d={fillPath([...TAIL_B, [118, 126, 0], [110, 112, 0], [100, 106, 0]])} fill="#dcecff" /></g>
          {/* film roll under the arm */}
          <path d="M2 94h30v26H2z" fill="#fff" />
          <ellipse cx="2" cy="107" rx="5" ry="13" fill="#bfe0ff" />
          <ellipse cx="32" cy="107" rx="5" ry="13" fill="#dcecff" />
        </>
      }
      ink={
        <>
          <Ink d={MUM} closed />
          <Ink d={MARM_L} closed />
          <Ink d={MARM_R} closed />
          {BANDS.map(([x1, y1, x2, y2]) => (
            <Ink key={y1} d={[[x1, y1, 0.3], [(x1 + x2) / 2, (y1 + y2) / 2 + 1, 1.0], [x2, y2, 0.3]]} />
          ))}
          <Ink d={[[30, 44, 0.3], [64, 38, 1.0], [98, 46, 0.3]]} />
          <Ink d={[[30, 56, 0.3], [64, 52, 1.0], [96, 58, 0.3]]} />
          <Brow x1={40} y1={36} x2={54} y2={36} w={2.2} />
          <Brow x1={68} y1={34} x2={84} y2={38} w={2.4} />
          <g className={s.blink}>
            <Eye cx={48} cy={48} rx={5.5} ry={7} />
            <Eye cx={74} cy={47} rx={6.5} ry={8} />
          </g>
          <Blush x={34} y={64} />
          <Blush x={84} y={62} />
          <Mouth cx={62} cy={70} w={10} h={6} />
          <g className={s.fA}><Ink d={TAIL_A} /></g>
          <g className={s.fB}><Ink d={TAIL_B} /></g>
          <Ink d={[[2, 94, 0.6], [32, 94, 0.8], [32, 120, 1.6], [2, 120, 1.2], [2, 94, 0.6]]} />
          <Ink d={[[2, 94, 0.4], [-2, 107, 1.6], [2, 120, 0.4]]} />
          <Ink d={[[32, 94, 0.4], [36, 107, 1.8], [32, 120, 0.4]]} />
        </>
      }
      {...props}
    />
  )
}

/* ---- Patchwork monster in a stitched-together tee ------------------- */

const PHEAD: P[] = [[38, 18, 1.2], [92, 16, 1.4], [96, 52, 2.2], [88, 72, 2.6], [66, 78, 2.6], [44, 72, 2.2], [34, 50, 1.6]]
const PTEE: P[] = [[26, 86, 1.4], [66, 80, 1.4], [104, 86, 1.8], [110, 142, 3.2], [20, 144, 2.8]]
const SLV_L: P[] = [[26, 86, 1.2], [8, 98, 1.6], [14, 118, 2.2], [32, 110, 1.8]]
const SLV_R: P[] = [[104, 86, 1.2], [124, 94, 1.6], [122, 126, 2.6], [104, 118, 2.0]]
const GREEN = "#8bd450"

export function Patchwork(props: Props) {
  const tee = fillPath(PTEE)
  return (
    <Fig
      viewBox="0 0 130 160"
      paint={
        <>
          <path d={fillPath(PHEAD)} fill={GREEN} />
          <Shade id="hw-pw-head" d={fillPath(PHEAD)} box={[34, 16, 62, 62]} t1="#6cb43a" t2="#4f8f28" light="#c7f09a" />
          <path d="M36 18h58v12c-20 4-38 4-58 0z" fill="#2b1b45" />
          {/* bolts */}
          <path d="M26 48h10v10H26z" fill="#a9b4c8" />
          <path d="M94 46h10v10H94z" fill="#7d8aa3" />
          <path d={tee} fill="#ff6fae" />
          <g clipPath="url(#hw-pw-tee)">
            <path d="M20 80h46v34H18z" fill="#ffd166" />
            <path d="M18 112h96v36H18z" fill="#5ed6c8" />
          </g>
          <Shade id="hw-pw-tee" d={tee} box={[20, 80, 90, 64]} t1="#1f1235" t2="#1f1235" />
          <path d={fillPath(SLV_L)} fill="#fff" />
          <g clipPath="url(#hw-pw-sl)">
            <path d="M6 98h30v5H6zM6 108h30v5H6z" fill="#ff6fae" />
          </g>
          <clipPath id="hw-pw-sl"><path d={fillPath(SLV_L)} /></clipPath>
          <path d={fillPath(SLV_R)} fill="#5ed6c8" />
          {/* arms */}
          <path d="M8 116c-2 10 0 18 6 22l8-4c-4-6-6-12-6-18z" fill={GREEN} />
          <path d="M122 124c2 10 0 18-6 22l-8-4c4-6 6-12 6-18z" fill="#6cb43a" />
        </>
      }
      ink={
        <>
          <Ink d={PHEAD} closed />
          <Ink d={[[36, 30, 0.3], [64, 34, 1.2], [94, 30, 0.3]]} />
          {/* forehead stitches */}
          <Ink d={[[50, 40, 0.3], [62, 38, 0.9], [74, 40, 0.3]]} />
          <Stitches pts={[[54, 39], [62, 38], [70, 39]]} />
          <Ink d={[[26, 48, 0.6], [36, 48, 0.8], [36, 58, 1.4], [26, 58, 1.0], [26, 48, 0.6]]} />
          <Ink d={[[94, 46, 0.6], [104, 46, 0.8], [104, 56, 1.4], [94, 56, 1.0], [94, 46, 0.6]]} />
          <Brow x1={44} y1={46} x2={58} y2={50} w={2.8} />
          <Brow x1={72} y1={50} x2={88} y2={46} w={3.0} />
          <g className={s.blink}>
            <Eye cx={52} cy={58} rx={6} ry={8.5} />
            <Eye cx={80} cy={57} rx={7} ry={9.5} />
          </g>
          <Blush x={38} y={66} />
          <Blush x={86} y={64} />
          <Mouth cx={66} cy={70} w={14} h={7} />
          <Sweat x={100} y={30} />
          <Ink d={PTEE} closed />
          <Ink d={SLV_L} closed />
          <Ink d={SLV_R} closed />
          {/* patch seams */}
          <Ink d={[[64, 82, 0.3], [66, 98, 0.8], [64, 114, 0.3]]} />
          <Ink d={[[20, 112, 0.3], [66, 114, 0.9], [110, 112, 0.3]]} />
          <Stitches pts={[[66, 88], [65, 96], [66, 104]]} />
          <Stitches pts={[[30, 113], [46, 114], [80, 114], [96, 113]]} />
          <Stitches pts={[[12, 134], [116, 140]]} />
          <Ink d={[[8, 116, 0.4], [6, 128, 1.2], [14, 138, 0.4]]} />
          <Ink d={[[122, 124, 0.4], [124, 136, 1.2], [116, 146, 0.4]]} />
        </>
      }
      {...props}
    />
  )
}

/* ---- Vampire pulling a screen print with a squeegee ----------------- */

const CAPE: P[] = [[30, 62, 1.4], [60, 48, 1.2], [100, 48, 1.6], [132, 64, 2.4], [142, 140, 3.4], [18, 142, 3.0]]
const VHEAD: P[] = [[54, 32, 1.2], [70, 20, 1.2], [90, 22, 1.4], [102, 40, 2.0], [100, 64, 2.6], [84, 76, 2.8], [62, 76, 2.4], [50, 56, 1.8]]
const SHIRT: P[] = [[60, 78, 1.2], [94, 78, 1.4], [104, 122, 2.8], [52, 124, 2.6]]
const FRAME: P[] = [[20, 102, 1.4], [152, 102, 1.6], [152, 142, 2.8], [20, 142, 2.6]]
const VARM: P[] = [[96, 96, 1.2], [120, 102, 1.6], [130, 116, 2.0], [122, 122, 1.8], [104, 110, 1.4]]

export function Vampire(props: Props) {
  return (
    <Fig
      viewBox="0 0 170 150"
      paint={
        <>
          <path d={fillPath(CAPE)} fill="#2b1b45" />
          <path d={fillPath([[40, 68, 0], [62, 56, 0], [98, 56, 0], [122, 70, 0], [130, 134, 0], [30, 136, 0]])} fill="#ff5c8a" />
          <path d={fillPath(SHIRT)} fill="#fff" />
          <path d="M70 80l8 6 8-6 2 8-10 4-10-4z" fill="#ff2e63" />
          <path d={fillPath(VHEAD)} fill="#f0e6ff" />
          <Shade id="hw-va-head" d={fillPath(VHEAD)} box={[50, 20, 52, 56]} t1="#d4c3f2" t2="#b39bdc" light="#fff" />
          <path d="M52 34c6-8 16-14 24-10 8-4 18 2 26 8-2-12-10-20-26-20S54 22 52 34z" fill="#1f1235" />
          <path d="M66 24l10 16 10-16z" fill="#1f1235" />
          {/* squeegee clasp */}
          <path d="M62 80h32v6H62z" fill="#d9a066" />
          <path d="M62 86h32v3H62z" fill="#ff2e63" />
          {/* screen frame + mesh + pulled ink */}
          <path d={fillPath(FRAME)} fill="#d9a066" />
          <path d="M28 108h116v26H28z" fill="#f6f1ff" />
          <path d="M28 108h116v26H28z" fill="url(#hw-tone)" opacity="0.35" />
          <path d="M28 108h70v26H28z" fill="#2b1b45" />
          <path d={fillPath(VARM)} fill="#f0e6ff" />
          <path d="M98 104h8v34h-8z" fill="#d9a066" />
          <path d="M96 134h12v4H96z" fill="#ff2e63" />
        </>
      }
      ink={
        <>
          <Ink d={CAPE} closed />
          <Ink d={[[30, 62, 0.4], [44, 50, 1.4], [56, 60, 0.4]]} />
          <Ink d={[[132, 64, 0.4], [118, 52, 1.4], [106, 60, 0.4]]} />
          <Ink d={SHIRT} closed />
          <Ink d={VHEAD} closed />
          <Ink d={[[52, 34, 0.4], [76, 26, 1.0], [102, 34, 0.4]]} />
          <Ink d={[[66, 24, 0.3], [76, 40, 1.4], [86, 24, 0.3]]} />
          <Brow x1={56} y1={40} x2={70} y2={44} w={2.4} />
          <Brow x1={82} y1={44} x2={98} y2={38} w={2.6} />
          <g className={s.blink}>
            <Eye cx={64} cy={52} rx={5.5} ry={8} />
            <Eye cx={88} cy={51} rx={6.5} ry={9} />
          </g>
          <Blush x={52} y={62} />
          <Blush x={94} y={60} />
          <Ink d={[[64, 66, 0.4], [76, 72, 1.8], [90, 64, 0.4]]} />
          <path d="M68 67l2.5 6 2.5-6z" fill="#fff" />
          <path d="M82 67l2.5 6 2.5-6z" fill="#fff" />
          <Ink d={[[62, 80, 0.6], [94, 80, 0.8], [94, 89, 1.6], [62, 89, 1.2], [62, 80, 0.6]]} />
          <Ink d={FRAME} closed />
          <Ink d={[[28, 108, 0.6], [144, 108, 0.8], [144, 134, 1.6], [28, 134, 1.2], [28, 108, 0.6]]} />
          <Ink d={[[98, 106, 0.4], [98, 134, 1.6], [100, 138, 0.4]]} />
          <Ink d={VARM} closed />
          <Ink d={[[98, 104, 0.6], [106, 104, 0.8], [106, 138, 1.4], [98, 138, 1.0]]} />
        </>
      }
      {...props}
    />
  )
}

/* ---- Zombie hand holding up a fresh tee ----------------------------- */

// The arm rises from the mound BEHIND the tee and grips the hanger above it.
const MOUND: P[] = [[10, 174, 1.6], [40, 158, 1.8], [70, 152, 1.8], [100, 156, 2.2], [124, 172, 3.0], [126, 188, 3.2], [8, 188, 2.8]]
const FOREARM: P[] = [[54, 162, 1.4], [58, 44, 1.6], [72, 42, 1.8], [76, 162, 2.4]]
const PALM: P[] = [[46, 54, 1.2], [82, 50, 1.6], [86, 26, 2.0], [50, 24, 1.6]]
const TEE: P[] = [[26, 66, 1.2], [56, 58, 1.2], [100, 64, 1.5], [122, 86, 2.0], [110, 94, 1.8], [106, 132, 2.8], [30, 134, 2.6], [24, 94, 1.8], [12, 86, 1.6]]

export function ZombieHand(props: Props) {
  const tee = fillPath(TEE)
  return (
    <Fig
      viewBox="0 0 130 192"
      paint={
        <>
          <path d={fillPath(FOREARM)} fill={GREEN} />
          <path d={tee} fill="#fff" />
          <Shade id="hw-zh-tee" d={tee} box={[12, 58, 110, 76]} t1="#d9ccf0" t2="#b9a6dc" />
          {/* print on the chest: a little grinning face */}
          <circle cx="66" cy="100" r="15" fill="#ff6fae" />
          <path d={fillPath(PALM)} fill={GREEN} />
          <Shade id="hw-zh-palm" d={fillPath(PALM)} box={[46, 24, 40, 30]} t1="#6cb43a" t2="#4f8f28" />
          {/* fingers curled round the hook */}
          <path d="M52 26c-2-8 0-14 6-16 4 2 6 8 4 16z" fill={GREEN} />
          <path d="M64 24c-2-9 1-16 7-18 4 3 6 9 4 18z" fill={GREEN} />
          <path d="M76 26c-2-8 1-14 7-16 4 2 5 8 3 16z" fill="#6cb43a" />
          <path d="M84 36c6-2 10 2 10 8-4 2-8 0-10-4z" fill="#6cb43a" />
          <path d={fillPath(MOUND)} fill="#7a4a2a" />
          <Shade id="hw-zh-mound" d={fillPath(MOUND)} box={[8, 152, 118, 36]} t1="#5e3820" t2="#452815" />
          <path d="M8 176c30-10 80-10 118 0v4H8z" fill="#4caf50" />
        </>
      }
      ink={
        <>
          {/* only the part of the arm below the tee is visible: ink that, not the ring */}
          <Ink d={[[55, 134, 0.3], [55, 150, 1.4], [54, 164, 0.4]]} />
          <Ink d={[[75, 134, 0.3], [76, 150, 2.2], [76, 164, 0.4]]} />
          <Stitches pts={[[58, 146], [64, 148], [70, 146]]} />
          <Ink d={[[56, 138, 0.3], [64, 142, 0.9], [72, 138, 0.3]]} />
          <Ink d={TEE} closed />
          <Ink d={[[26, 94, 0.3], [60, 90, 0.8], [106, 94, 0.3]]} />
          {/* hanger: shoulders inside the tee, hook up into the fist */}
          <Ink d={[[36, 76, 0.4], [66, 60, 1.2], [96, 76, 0.4]]} />
          <Ink d={[[66, 60, 0.4], [66, 44, 1.4], [72, 40, 0.4]]} />
          {/* print face */}
          <g className={s.blink}>
            <Eye cx={60} cy={98} rx={3.6} ry={5} />
            <Eye cx={72} cy={97} rx={4} ry={5.6} />
          </g>
          <Brow x1={55} y1={90} x2={64} y2={90} w={1.6} />
          <Brow x1={68} y1={89} x2={78} y2={91} w={1.8} />
          <Mouth cx={66} cy={108} w={10} h={5} />
          <Blush x={50} y={104} />
          <Blush x={76} y={103} />
          <Ink d={PALM} closed />
          <Ink d={[[52, 26, 0.4], [54, 10, 1.6], [62, 26, 0.4]]} />
          <Ink d={[[64, 24, 0.4], [68, 6, 1.8], [75, 24, 0.4]]} />
          <Ink d={[[76, 26, 0.4], [80, 10, 1.6], [86, 26, 0.4]]} />
          <Ink d={[[84, 36, 0.4], [94, 40, 1.6], [90, 46, 0.4]]} />
          <Stitches pts={[[52, 44], [60, 46]]} />
          <Ink d={MOUND} closed />
          {[20, 44, 92, 112].map((gx) => (
            <g key={gx}>
              <Ink d={[[gx, 174, 0.3], [gx - 2, 168, 1.0], [gx - 3, 164, 0.3]]} />
              <Ink d={[[gx + 3, 174, 0.3], [gx + 4, 167, 1.0], [gx + 4, 162, 0.3]]} />
            </g>
          ))}
        </>
      }
      {...props}
    />
  )
}

/* ---- Spider on a thread, wearing a tiny cap ------------------------- */

const SBODY: P[] = [[40, 54, 1.2], [62, 52, 1.4], [74, 70, 2.4], [60, 90, 2.8], [36, 88, 2.6], [26, 70, 1.8]]
const CAP: P[] = [[30, 56, 1.2], [38, 36, 1.4], [60, 34, 1.6], [72, 52, 2.0], [56, 58, 1.6]]
const PEAK: P[] = [[66, 52, 1.2], [92, 50, 1.6], [92, 58, 2.0], [68, 58, 1.6]]
const SLEGS: P[][] = [
  [[30, 66, 1.6], [16, 58, 1.2], [8, 64, 0.3]],
  [[28, 72, 1.6], [14, 72, 1.2], [6, 80, 0.3]],
  [[28, 78, 1.6], [16, 84, 1.2], [12, 94, 0.3]],
  [[32, 84, 1.6], [24, 94, 1.2], [26, 104, 0.3]],
]

export function CapSpider(props: Props) {
  return (
    <Fig
      viewBox="0 0 100 110"
      paint={
        <>
          <path d={fillPath(SBODY)} fill="#ff6fae" />
          <Shade id="hw-cs-body" d={fillPath(SBODY)} box={[26, 52, 48, 38]} t1="#e0498a" t2="#b8356e" light="#ffb3d1" />
          <path d={fillPath(CAP)} fill="#5b8def" />
          <path d={fillPath(PEAK)} fill="#3f63c4" />
          <circle cx="50" cy="34" r="3" fill="#ffd166" />
        </>
      }
      ink={
        <>
          <Ink d={[[50, 0, 0.3], [50.5, 18, 0.8], [50, 36, 0.3]]} />
          <g className={s.legsL}>{SLEGS.map((d, i) => <Ink key={i} d={d} />)}</g>
          <g className={s.legsR}>{SLEGS.map((d, i) => <Ink key={i} d={mirror(d, 50)} />)}</g>
          <Ink d={SBODY} closed />
          <Ink d={CAP} closed />
          <Ink d={PEAK} closed />
          <Ink d={[[38, 50, 0.3], [50, 46, 0.9], [62, 50, 0.3]]} />
          <g className={s.blink}>
            <Eye cx={42} cy={68} rx={4.5} ry={6.5} />
            <Eye cx={58} cy={67} rx={5.5} ry={7.5} />
            <circle cx="35" cy="62" r="2.2" fill="#fff" />
            <circle cx="35.5" cy="62.5" r="1.1" fill={INK} />
            <circle cx="66" cy="60" r="2.2" fill="#fff" />
            <circle cx="66.5" cy="60.5" r="1.1" fill={INK} />
          </g>
          <Blush x={32} y={78} />
          <Blush x={64} y={76} />
          <Mouth cx={50} cy={81} w={10} h={5} />
        </>
      }
      {...props}
    />
  )
}

/* ---- Candy-corn trio ------------------------------------------------ */

const corn = (cx: number): P[] => [[cx - 24, 92, 2.4], [cx - 18, 56, 1.6], [cx - 8, 22, 1.2], [cx + 6, 20, 1.3], [cx + 18, 56, 2.2], [cx + 24, 92, 3.0], [cx, 100, 3.0]]

export function CandyCorn(props: Props) {
  const xs = [32, 90, 148]
  return (
    <Fig
      viewBox="0 0 180 110"
      paint={
        <>
          {xs.map((cx, i) => {
            const d = fillPath(corn(cx))
            return (
              <g key={cx}>
                <path d={d} fill="#ffd166" />
                <clipPath id={`hw-cc-${i}`}><path d={d} /></clipPath>
                <g clipPath={`url(#hw-cc-${i})`}>
                  <path d={`M${cx - 30} 16h60v26h-60z`} fill="#fff" />
                  <path d={`M${cx - 30} 42h60v32h-60z`} fill="#ff8c1a" />
                </g>
                <Shade id={`hw-ccs-${i}`} d={d} box={[cx - 24, 20, 48, 80]} t1="#1f1235" t2="#1f1235" />
              </g>
            )
          })}
        </>
      }
      ink={
        <>
          {xs.map((cx) => (
            <Ink key={cx} d={corn(cx)} closed />
          ))}
          {/* 1: cheerful */}
          <Brow x1={22} y1={46} x2={32} y2={44} w={1.8} />
          <Brow x1={36} y1={44} x2={46} y2={46} w={1.8} />
          <g className={s.blink}>
            <Eye cx={26} cy={58} rx={4.5} ry={6.5} />
            <Eye cx={40} cy={57} rx={5} ry={7} />
          </g>
          <Blush x={14} y={70} />
          <Blush x={44} y={68} />
          <Mouth cx={33} cy={78} w={10} h={6} />
          {/* 2: grumpy */}
          <Brow x1={78} y1={44} x2={90} y2={50} w={2.4} />
          <Brow x1={92} y1={50} x2={104} y2={44} w={2.4} />
          <g className={s.blink}>
            <Eye cx={84} cy={60} rx={4.5} ry={6} />
            <Eye cx={98} cy={59} rx={5} ry={6.5} />
          </g>
          <Ink d={[[82, 80, 0.4], [91, 78, 1.8], [100, 80, 0.4]]} />
          <Blush x={72} y={72} />
          {/* 3: surprised */}
          <Brow x1={138} y1={38} x2={148} y2={34} w={1.8} />
          <Brow x1={152} y1={34} x2={162} y2={38} w={1.8} />
          <g className={s.blink}>
            <Eye cx={142} cy={56} rx={5} ry={7.5} />
            <Eye cx={157} cy={55} rx={5.5} ry={8} />
          </g>
          <Ink d={[[144, 76, 1.2], [150, 72, 1.4], [156, 76, 1.6], [150, 82, 1.8]]} closed />
          <path d="M146 76a4 4 0 0 0 8 0z" fill={TONGUE} />
          <Sweat x={170} y={28} />
        </>
      }
      {...props}
    />
  )
}

/* ---- "Proof approved" stamp ghost ----------------------------------- */

const SG: P[] = [[26, 30, 1.2], [44, 18, 1.2], [62, 30, 1.6], [66, 60, 2.2], [64, 88, 2.6], [54, 82, 2.4], [44, 92, 2.4], [34, 82, 2.2], [24, 92, 2.0], [20, 60, 1.6]]
const SARM: P[] = [[62, 52, 1.0], [80, 56, 1.4], [92, 66, 1.8], [86, 72, 1.6], [70, 62, 1.4]]

export function StampGhost(props: Props) {
  const body = fillPath(SG)
  return (
    <Fig
      viewBox="0 0 130 120"
      paint={
        <>
          {/* paper with the stamped mark */}
          <path d="M74 60l48-4 4 44-50 4z" fill="#fff" />
          <path d="M84 74c6-2 20-4 30-2l2 18c-10 2-22 2-32 0z" fill="#ff2e63" opacity="0.18" />
          <path d={body} fill="#f6f1ff" />
          <Shade id="hw-sg-body" d={body} box={[20, 18, 46, 74]} t1="#d9ccf0" t2="#b9a6dc" light="#fff" />
          <path d={fillPath(SARM)} fill="#f6f1ff" />
          {/* rubber stamp */}
          <path d="M86 46h12v16H86z" fill="#d9a066" />
          <path d="M80 60h24v8H80z" fill="#5b3a9b" />
          {/* ink splats */}
          <circle cx="110" cy="62" r="2" fill="#ff2e63" />
          <circle cx="116" cy="68" r="1.2" fill="#ff2e63" />
        </>
      }
      ink={
        <>
          <Ink d={[[74, 60, 0.6], [122, 56, 0.8], [126, 100, 1.8], [76, 104, 1.4], [74, 60, 0.6]]} />
          {/* stamped mark: box + big tick */}
          <g fill="#ff2e63">
            <Ink d={[[84, 76, 1.0], [114, 72, 1.4], [116, 90, 1.6], [86, 94, 1.4], [84, 76, 1.0]]} fill="#ff2e63" />
            <Ink d={[[90, 84, 1.0], [98, 90, 2.6], [110, 76, 1.2]]} fill="#ff2e63" />
          </g>
          <Ink d={SG} closed />
          <Ink d={[[36, 36, 0.3], [34, 54, 1.0], [38, 72, 0.3]]} />
          <Brow x1={30} y1={34} x2={40} y2={32} w={2} />
          <Brow x1={46} y1={30} x2={58} y2={34} w={2.2} />
          <g className={s.blink}>
            <Eye cx={36} cy={46} rx={5} ry={7.5} />
            <Eye cx={52} cy={44} rx={6} ry={8.5} />
          </g>
          <Blush x={24} y={56} />
          <Blush x={56} y={54} />
          <Mouth cx={44} cy={62} w={11} h={7} />
          <Ink d={SARM} closed />
          <Ink d={[[86, 46, 0.6], [98, 46, 0.8], [98, 62, 1.4], [86, 62, 1.0], [86, 46, 0.6]]} />
          <Ink d={[[80, 60, 0.6], [104, 60, 0.8], [104, 68, 1.6], [80, 68, 1.2], [80, 60, 0.6]]} />
        </>
      }
      {...props}
    />
  )
}
