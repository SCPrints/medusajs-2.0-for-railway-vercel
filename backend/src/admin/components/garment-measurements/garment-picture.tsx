import type { GarmentType } from "../../../lib/garment-measurements"

/**
 * Flat-lay outlines for the measuring flow. Each step shows the garment in
 * grey with only its own tape line in colour. Coordinates are in a 400 × 400
 * box; left and right are the viewer's.
 */

type Tape = { d: string; ends?: [number, number][]; guide?: string; dashed?: boolean }

const HOODIE_BODY = [
  // hood laid up behind the neck
  "M165,58 C130,40 135,-2 200,-20 C265,-2 270,40 235,58",
  // left sleeve + cuff, body, right sleeve + cuff
  "M165,58 L30,200 L16,214 L36,233 L50,219 L125,150 L128,318 L132,348 L268,348 L272,318 L275,150 L350,219 L364,233 L384,214 L370,200 L235,58 Q200,94 165,58 Z",
].join(" ")
const HOODIE_DETAIL = [
  "M165,58 L125,150 M235,58 L275,150", // raglan seams
  "M30,200 L50,219 M370,200 L350,219", // cuff seams
  "M128,318 L272,318", // waistband seam
  "M155,250 L245,250 L260,316 L140,316 Z", // pouch pocket (drawn, not measured)
  "M190,84 L186,120 M210,84 L214,120", // drawcords
].join(" ")

const HOOD_SIDE = "M112,332 C96,262 98,158 150,96 C200,58 278,62 308,124 C336,186 332,272 284,334 Q198,352 112,332 Z"
const HOOD_DETAIL = "M150,96 C215,86 270,120 290,200 M106,300 L92,336 M112,332 L60,380 M284,334 L340,380" // centre seam, drawcord, shoulders

const TEE_BODY =
  "M168,50 L100,72 L42,150 L78,178 L112,140 L114,360 L286,360 L288,140 L322,178 L358,150 L300,72 L232,50 Q200,84 168,50 Z"
const TEE_DETAIL = [
  "M176,46 Q200,72 224,46", // neck rib edge
  "M100,72 Q118,110 112,140 M300,72 Q282,110 288,140", // armhole seams
].join(" ")

const TAPES: Record<GarmentType, Record<string, Tape>> = {
  hoodie: {
    neck_seam_round: { d: "M165,58 Q200,94 235,58", guide: "M165,58 Q200,46 235,58", ends: [[165, 58], [235, 58]] },
    chest_flat: { d: "M127,166 L273,166", ends: [[127, 166], [273, 166]] },
    body_length: { d: "M168,58 L168,318", ends: [[168, 58], [168, 318]] },
    hem_flat: { d: "M128,316 L272,316", ends: [[128, 316], [272, 316]] },
    waistband_height: { d: "M250,318 L250,348", ends: [[250, 318], [250, 348]] },
    waistband_relaxed_flat: { d: "M132,344 L268,344", ends: [[132, 344], [268, 344]] },
    sleeve_top: { d: "M165,58 L30,200", ends: [[165, 58], [30, 200]] },
    cuff_height: { d: "M40,210 L26,224", ends: [[40, 210], [26, 224]] },
    cuff_relaxed_flat: { d: "M16,214 L36,233", ends: [[16, 214], [36, 233]] },
    // hood steps use the side-on hood picture
    hood_height: { d: "M205,342 L205,70", guide: "M120,70 L312,70", ends: [[205, 342], [205, 70]] },
    hood_depth: { d: "M99,200 L332,200", ends: [[99, 200], [332, 200]] },
  },
  tee: {
    neck: { d: "M168,50 L232,50", ends: [[168, 50], [232, 50]] },
    neck_drop_front: { d: "M200,50 L200,84", guide: "M160,50 L240,50", ends: [[200, 50], [200, 84]] },
    shoulder: { d: "M100,72 L300,72", ends: [[100, 72], [300, 72]] },
    armhole: { d: "M168,50 L168,140", guide: "M112,140 L168,140", ends: [[168, 50], [168, 140]] },
    chest: { d: "M113,152 L287,152", ends: [[113, 152], [287, 152]] },
    length: { d: "M168,50 L168,360", ends: [[168, 50], [168, 360]] },
    sleeve: { d: "M100,72 L42,150", ends: [[100, 72], [42, 150]] },
    sleeve_width: { d: "M112,140 L72,110", ends: [[112, 140], [72, 110]] },
    opening: { d: "M42,150 L78,178", ends: [[42, 150], [78, 178]] },
  },
}

const HOOD_KEYS = new Set(["hood_height", "hood_depth"])

export function GarmentPicture({ type, step, className }: { type: GarmentType; step: string; className?: string }) {
  const tape = TAPES[type][step]
  const hood = type === "hoodie" && HOOD_KEYS.has(step)
  const body = hood ? HOOD_SIDE : type === "hoodie" ? HOODIE_BODY : TEE_BODY
  const detail = hood ? HOOD_DETAIL : type === "hoodie" ? HOODIE_DETAIL : TEE_DETAIL
  return (
    <svg viewBox="0 -24 400 400" className={className} role="img" aria-label="Where to measure">
      <path d={body} style={{ fill: "var(--bg-subtle, #f4f4f5)", stroke: "var(--fg-muted, #a1a1aa)" }} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={detail} fill="none" style={{ stroke: "var(--fg-muted, #a1a1aa)" }} strokeWidth={1.5} strokeDasharray="5 5" />
      {hood && (
        <g style={{ fill: "var(--fg-muted, #a1a1aa)" }} fontSize={18} fontFamily="inherit">
          <text x={30} y={290}>Face</text>
          <text x={336} y={290}>Back</text>
        </g>
      )}
      {tape?.guide && <path d={tape.guide} fill="none" stroke="#e5007e" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.7} />}
      {tape && (
        <>
          <path
            d={tape.d}
            fill="none"
            stroke="#e5007e"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={tape.dashed ? "8 6" : undefined}
          />
          {tape.ends?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} fill="#e5007e" stroke="white" strokeWidth={2} />)}
        </>
      )}
    </svg>
  )
}
