/**
 * Flat garment measurements for the internal 3D garment builder.
 *
 * Pure (no @medusajs/framework imports): the admin measuring flow, the admin
 * routes and the seed script all read it. Keys match the taped file the 3D
 * scripts already read (sc-prints-3d/garment-3d/data/taped/as-colour-supply-hood-5101.json),
 * so an export drops straight into `hoodie.py --tape SIZE` via TAPE_FILE.
 *
 * Every value is cm, measured with the garment lying flat on a table.
 */

export type GarmentType = "hoodie" | "tee"
export type StepGroup = "Body" | "Sleeves" | "Hood" | "Extras"

export type MeasurementStep = {
  key: string
  group: StepGroup
  /** Plain name shown big on the step, e.g. "Chest: armpit to armpit". */
  name: string
  /** One how-to line. */
  how: string
  /** Plausible range in cm; outside it the flow asks "are you sure?". */
  min: number
  max: number
  /** Extras: skipped unless staff choose to do them. */
  optional?: boolean
}

type GarmentDef = {
  label: string
  /** Fixed order: body top to bottom, then sleeves, then hood, then extras. */
  steps: MeasurementStep[]
  /** Constant flags written into every exported size (the 3D scripts read them). */
  flags?: Record<string, boolean>
}

const chest: MeasurementStep = {
  key: "chest_flat",
  group: "Body",
  name: "Chest: armpit to armpit",
  how: "Measure straight across, 2 cm below the armpits.",
  min: 35,
  max: 90,
}
const frontNeckDrop: MeasurementStep = {
  key: "front_neck_drop",
  group: "Body",
  name: "Front neck drop",
  how: "From the top of the shoulder at the neck, straight down to the neck seam at the centre front.",
  min: 3,
  max: 20,
}
const bicep: MeasurementStep = {
  key: "bicep_flat",
  group: "Sleeves",
  name: "Sleeve width at the armpit",
  how: "Measure straight across the sleeve, 2 cm below the armpit.",
  min: 10,
  max: 35,
}

export const GARMENTS: Record<GarmentType, GarmentDef> = {
  hoodie: {
    label: "Hoodie (raglan sleeve)",
    // Body length is measured to the waistband seam; hoodie.py adds the band back on.
    flags: { body_length_to_seam: true },
    steps: [
      {
        key: "neck_seam_round",
        group: "Body",
        name: "Neck seam: all the way round",
        how: "Run the tape along the seam where the hood joins, across the front then the back, and add the two.",
        min: 40,
        max: 100,
      },
      frontNeckDrop,
      chest,
      {
        key: "body_length",
        group: "Body",
        name: "Body length: shoulder to waistband seam",
        how: "From the top of the shoulder next to the neck, straight down to the waistband seam (not the bottom of the band).",
        min: 50,
        max: 100,
      },
      {
        key: "hem_flat",
        group: "Body",
        name: "Bottom width: along the waistband seam",
        how: "Measure straight across the body, along the seam just above the waistband.",
        min: 35,
        max: 90,
      },
      {
        key: "waistband_height",
        group: "Body",
        name: "Waistband height",
        how: "From the waistband seam down to the bottom edge.",
        min: 2,
        max: 15,
      },
      {
        key: "waistband_relaxed_flat",
        group: "Body",
        name: "Waistband width: not stretched",
        how: "Measure straight across the bottom edge. Don't pull it.",
        min: 30,
        max: 90,
      },
      {
        key: "sleeve_top",
        group: "Sleeves",
        name: "Sleeve length: neck to end of cuff",
        how: "From the neck seam, along the top of the sleeve, to the end of the cuff.",
        min: 50,
        max: 100,
      },
      {
        key: "underarm",
        group: "Sleeves",
        name: "Underarm: armpit to end of cuff",
        how: "From the armpit, along the underside of the sleeve, to the end of the cuff.",
        min: 35,
        max: 75,
      },
      bicep,
      {
        key: "cuff_height",
        group: "Sleeves",
        name: "Cuff height",
        how: "From the cuff seam to the end of the cuff.",
        min: 2,
        max: 12,
      },
      {
        key: "cuff_relaxed_flat",
        group: "Sleeves",
        name: "Cuff width: not stretched",
        how: "Measure straight across the end of the cuff. Don't pull it.",
        min: 5,
        max: 20,
      },
      {
        key: "hood_height",
        group: "Hood",
        name: "Hood height",
        how: "Lay the hood flat. From the neck seam at the front, straight up to the top of the hood.",
        min: 25,
        max: 50,
      },
      {
        key: "hood_depth",
        group: "Hood",
        name: "Hood depth",
        how: "Lay the hood flat. From the front edge, straight back to the back seam.",
        min: 18,
        max: 40,
      },
      {
        key: "pocket_top",
        group: "Extras",
        name: "Pocket: shoulder to top of pocket",
        how: "From the top of the shoulder next to the neck, straight down to the top of the pocket.",
        min: 10,
        max: 50,
        optional: true,
      },
      {
        key: "pocket_height",
        group: "Extras",
        name: "Pocket height",
        how: "From the top of the pocket to the bottom of the pocket.",
        min: 8,
        max: 35,
        optional: true,
      },
      {
        key: "pocket_opening",
        group: "Extras",
        name: "Pocket opening",
        how: "Along the edge of one hand opening, top to bottom.",
        min: 8,
        max: 30,
        optional: true,
      },
      {
        key: "hood_face_opening",
        group: "Extras",
        name: "Hood front edge",
        how: "Along the front edge of the hood, from the neck seam to the top of the hood.",
        min: 25,
        max: 55,
        optional: true,
      },
    ],
  },
  tee: {
    label: "T-shirt (set-in sleeve)",
    steps: [
      {
        key: "neck_width",
        group: "Body",
        name: "Neck width: seam to seam",
        how: "Straight across the top of the neck opening, from one neck seam to the other.",
        min: 12,
        max: 28,
      },
      {
        key: "neckband_height",
        group: "Body",
        name: "Neckband height",
        how: "From the neck seam to the edge of the rib.",
        min: 1,
        max: 5,
      },
      frontNeckDrop,
      {
        key: "back_neck_drop",
        group: "Body",
        name: "Back neck drop",
        how: "Turn it over. From the top of the shoulder at the neck, down to the neck seam at the centre back.",
        min: 0.5,
        max: 6,
      },
      {
        key: "shoulder_width",
        group: "Body",
        name: "Shoulders: seam to seam",
        how: "Straight across the back, from one shoulder seam to the other.",
        min: 35,
        max: 75,
      },
      {
        key: "armhole",
        group: "Body",
        name: "Armhole depth: shoulder to armpit",
        how: "From the top of the shoulder next to the neck, straight down to the level of the armpit.",
        min: 15,
        max: 35,
      },
      chest,
      {
        key: "body_length",
        group: "Body",
        name: "Body length: shoulder to hem",
        how: "From the top of the shoulder next to the neck, straight down to the bottom edge.",
        min: 50,
        max: 100,
      },
      {
        key: "hem_flat",
        group: "Body",
        name: "Bottom width",
        how: "Measure straight across the bottom edge.",
        min: 35,
        max: 90,
      },
      {
        key: "sleeve_length",
        group: "Sleeves",
        name: "Sleeve length: shoulder seam to hem",
        how: "Along the top of the sleeve, from the shoulder seam to the sleeve's bottom edge.",
        min: 10,
        max: 40,
      },
      bicep,
      {
        key: "sleeve_opening_flat",
        group: "Sleeves",
        name: "Sleeve opening",
        how: "Measure straight across the end of the sleeve.",
        min: 10,
        max: 30,
      },
    ],
  },
}

export const GARMENT_TYPES = Object.keys(GARMENTS) as GarmentType[]

export const isGarmentType = (v: unknown): v is GarmentType =>
  typeof v === "string" && v in GARMENTS

export const requiredSteps = (t: GarmentType) => GARMENTS[t].steps.filter((s) => !s.optional)

export const findStep = (t: GarmentType, key: string) => GARMENTS[t].steps.find((s) => s.key === key)

/** "Hood" / "Hoodie" / "Hooded" → hoodie, everything else → tee. Staff can switch before the first value. */
export function inferGarmentType(title: string | null | undefined): GarmentType {
  return /\bhood/i.test(title ?? "") ? "hoodie" : "tee"
}

const SIZE_ORDER = [
  "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL",
]
const sizeRank = (s: string): number => {
  const u = s.trim().toUpperCase().replace(/^XXL$/, "2XL").replace(/^XXXL$/, "3XL")
  const i = SIZE_ORDER.indexOf(u)
  if (i >= 0) return i
  const n = parseFloat(u) // kids 2, 4, 6 … sort before adult letters
  return Number.isFinite(n) ? -100 + n : 1000
}

/** Size labels in garment order (XS → 5XL; kids numbers first; unknowns last, as given). */
export function sortSizes(sizes: string[]): string[] {
  return sizes
    .map((s, i) => ({ s, i, r: sizeRank(s) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s)
}

/** cm to 1 mm; also hides float4 noise (36.7 → 36.70000076). */
export const roundCm = (v: number) => Math.round(v * 10) / 10

/**
 * The "are you sure?" check for one value. Returns a plain question for staff,
 * or null when it looks fine. `bySize` holds the values already recorded for
 * this key on the other sizes.
 */
export function checkMeasurement(args: {
  step: Pick<MeasurementStep, "name" | "min" | "max">
  value: number
  size: string
  sizes: string[]
  bySize: Record<string, number | undefined>
}): string | null {
  const { step, value, size, sizes, bySize } = args
  if (!Number.isFinite(value) || value <= 0) return "Enter the measurement in cm, e.g. 56.5."

  if (value > step.max || value < step.min) {
    for (const f of [10, 0.1]) {
      const guess = roundCm(value / f)
      if (guess >= step.min && guess <= step.max && !checkMeasurement({ ...args, value: guess }))
        return `${value} cm looks wrong for this one. Did you mean ${guess}?`
    }
    return `${value} cm is ${value > step.max ? "bigger" : "smaller"} than we'd expect (${step.min} to ${step.max} cm). Are you sure? Measure flat, in cm.`
  }

  // ponytail: 0.5 cm slack for tape noise; sizes that don't grade (hood depth) are equal, not flagged.
  const SLACK = 0.5
  const order = sortSizes(Array.from(new Set([...sizes, size])))
  const at = order.indexOf(size)
  const find = (from: number, dir: -1 | 1) => {
    for (let i = from + dir; i >= 0 && i < order.length; i += dir) {
      const v = bySize[order[i]]
      if (typeof v === "number") return { size: order[i], value: v }
    }
    return null
  }
  const smaller = find(at, -1)
  const bigger = find(at, 1)
  if (smaller && value < smaller.value - SLACK)
    return `That's less than ${smaller.size} (${roundCm(smaller.value)} cm). Are you sure?`
  if (bigger && value > bigger.value + SLACK)
    return `That's more than ${bigger.size} (${roundCm(bigger.value)} cm). Are you sure?`
  return null
}

export type MeasurementRow = {
  size: string
  key: string
  value_cm: number
  estimated?: boolean | null
}

export type SizeStatus = "done" | "partly" | "estimated" | "todo"

/** One size's state for the size grid: estimated if any value is a guess, done when every required step has a value. */
export function sizeStatus(t: GarmentType, rows: MeasurementRow[]): SizeStatus {
  if (!rows.length) return "todo"
  if (rows.some((r) => r.estimated)) return "estimated"
  const have = new Set(rows.map((r) => r.key))
  return requiredSteps(t).every((s) => have.has(s.key)) ? "done" : "partly"
}

/**
 * `{ <size>: { <key>: number, ... } }` in the taped-file shape the 3D scripts
 * read. Estimated sizes carry `_inferred: true`. Keys follow the measuring
 * order; keys outside the lists (seeded extras) follow alphabetically.
 */
export function buildExport(t: GarmentType, rows: MeasurementRow[]): Record<string, Record<string, number | boolean>> {
  const order = new Map(GARMENTS[t].steps.map((s, i) => [s.key, i]))
  const rank = (k: string) => order.get(k) ?? 1000
  const out: Record<string, Record<string, number | boolean>> = {}
  for (const size of sortSizes(Array.from(new Set(rows.map((r) => r.size))))) {
    const mine = rows
      .filter((r) => r.size === size)
      .sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
    const row: Record<string, number | boolean> = { ...(GARMENTS[t].flags ?? {}) }
    if (mine.some((r) => r.estimated)) row._inferred = true
    for (const r of mine) row[r.key] = roundCm(Number(r.value_cm))
    out[size] = row
  }
  return out
}
