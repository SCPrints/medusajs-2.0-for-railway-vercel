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
export type StepGroup = "Body" | "Sleeves" | "Hood"

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
}

type GarmentDef = {
  label: string
  /** Fixed order: body top to bottom, then sleeves, then hood. */
  steps: MeasurementStep[]
  /** Constant flags written into every exported size (the 3D scripts read them). */
  flags?: Record<string, boolean>
}

const step = (key: string, group: StepGroup, name: string, how: string, min: number, max: number): MeasurementStep => ({
  key, group, name, how, min, max,
})

/**
 * Only what shapes the 3D model. Hoodie keys are the ones scp/hoodie.py fits
 * the GarmentCode pattern to (one setting each); tee keys are pattern-tee.py's
 * inputs, named as that script names them. Not asked, on purpose: back neck
 * drop (pattern-tee uses a fixed 2 cm, and it reads 0 on a flat tee), shoulder
 * slope (worked out) and sleeve cap height (needs the seam opened).
 */
export const GARMENTS: Record<GarmentType, GarmentDef> = {
  hoodie: {
    label: "Hoodie (raglan sleeve)",
    // Body length is measured to the waistband seam; hoodie.py adds the band back on.
    flags: { body_length_to_seam: true },
    steps: [
      step("neck_seam_round", "Body", "Neck seam: all the way round",
        "Measure along the seam where the hood is sewn on, across the front. Turn it over, measure the back the same way, and add the two.", 40, 100),
      step("chest_flat", "Body", "Chest: armpit to armpit",
        "Straight across from side to side, 1.5 cm below the armpits.", 35, 90),
      step("body_length", "Body", "Body length: shoulder to waistband seam",
        "Start at the top of the shoulder, on the seam where the hood is sewn on. Measure straight down to the waistband seam. Don't include the waistband.", 50, 100),
      step("hem_flat", "Body", "Bottom width: along the waistband seam",
        "Straight across the body, along the waistband seam. Don't include the waistband.", 35, 90),
      step("waistband_height", "Body", "Waistband height",
        "From the waistband seam down to the bottom edge of the waistband.", 2, 15),
      step("waistband_relaxed_flat", "Body", "Waistband width: not stretched",
        "Straight across the bottom edge of the waistband. Don't pull it.", 30, 90),
      step("sleeve_top", "Sleeves", "Sleeve length: neck to cuff seam",
        "Start where the middle of the sleeve meets the seam the hood is sewn on. Follow the top of the sleeve to the cuff seam. Don't include the cuff.", 50, 100),
      step("cuff_height", "Sleeves", "Cuff height",
        "From the cuff seam to the end of the cuff.", 2, 12),
      step("cuff_relaxed_flat", "Sleeves", "Cuff width: not stretched",
        "Straight across the end of the cuff. Don't pull it.", 5, 20),
      step("hood_height", "Hood", "Hood height",
        "Lay the hood flat. From the seam where the hood is sewn on, at the front, straight up to the top of the hood.", 25, 50),
      step("hood_depth", "Hood", "Hood depth",
        "Lay the hood flat. From the front edge of the hood, straight back to the back of the hood.", 18, 40),
    ],
  },
  tee: {
    label: "T-shirt (set-in sleeve)",
    steps: [
      step("neck", "Body", "Neck width: seam to seam",
        "Straight across the neck, from the collar seam (where the rib is sewn on) on one side to the collar seam on the other. Don't include the rib.", 12, 28),
      step("neck_drop_front", "Body", "Front neck drop",
        "Lay a ruler across the neck, collar seam to collar seam. Measure straight down from the ruler to the collar seam at the centre front. Don't include the rib.", 3, 20),
      step("shoulder", "Body", "Shoulders: seam to seam",
        "Straight across the top, from where the sleeve is sewn on at one shoulder to the same point on the other shoulder.", 35, 75),
      step("armhole", "Body", "Armhole depth: shoulder to armpit",
        "Start where the shoulder seam meets the collar seam. Measure straight down to level with the armpit seam.", 15, 40),
      step("chest", "Body", "Chest: armpit to armpit",
        "Straight across from side to side, 2 cm below the armpit seams.", 35, 90),
      step("length", "Body", "Body length: shoulder to hem",
        "Start where the shoulder seam meets the collar seam. Measure straight down to the bottom edge of the shirt.", 50, 100),
      step("sleeve", "Sleeves", "Sleeve length: shoulder seam to end",
        "Along the top of the sleeve, from where it's sewn on at the shoulder to the end of the sleeve.", 10, 85),
      step("sleeve_width", "Sleeves", "Sleeve width at the armpit",
        "Straight across the sleeve, starting right at the armpit seam.", 10, 40),
      step("opening", "Sleeves", "Sleeve opening",
        "Straight across the end of the sleeve, at the very edge.", 10, 30),
    ],
  },
}

export const GARMENT_TYPES = Object.keys(GARMENTS) as GarmentType[]

export const isGarmentType = (v: unknown): v is GarmentType =>
  typeof v === "string" && v in GARMENTS

export const requiredSteps = (t: GarmentType) => GARMENTS[t].steps

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
