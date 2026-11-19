/**
 * Size lists: turn what a team manager pastes from a spreadsheet (or drops as
 * a CSV) into people with sizes, and count those sizes into order quantities.
 * Pure — no React, no fetch. Used by the People tab and the range order form.
 */

export type SizeListColumn = "name" | "first_name" | "last_name" | "unit" | "number" | "size" | "notes" | `size:${string}`

export type SizeListPerson = {
  name: string
  unit: string | null
  number: string | null
  sizes: Record<string, string>
  notes: string | null
}

export type SizeListRow = SizeListPerson & {
  /** 1-based line in what was pasted, for "row 14". */
  line: number
  /** The cells as pasted, for the preview. */
  cells: string[]
  problems: string[]
}

export type SizeListResult = {
  /** One entry per pasted column: what we think it is (null = ignored). */
  columns: Array<SizeListColumn | null>
  hasHeader: boolean
  rows: SizeListRow[]
  problemCount: number
  /** True when sizes came from a plain "Size" column (no garment type named). */
  genericSize: boolean
}

// ── Reading the text ────────────────────────────────────────────────────────

/** Tab, comma or semicolon separated text → cells. Handles "quoted, cells". */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  const firstLine = src.split("\n").find((l) => l.trim()) ?? ""
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === "") quoted = true
    else if (ch === delimiter) {
      row.push(cell.trim())
      cell = ""
    } else if (ch === "\n") {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  row.push(cell.trim())
  rows.push(row)
  return rows.filter((r) => r.some((c) => c !== ""))
}

// ── Sizes ───────────────────────────────────────────────────────────────────

const SIZE_WORDS: Record<string, string> = {
  xxxsmall: "3xs",
  xxsmall: "2xs",
  xxs: "2xs",
  xsmall: "xs",
  extrasmall: "xs",
  small: "s",
  sml: "s",
  medium: "m",
  med: "m",
  large: "l",
  lge: "l",
  lg: "l",
  xlarge: "xl",
  extralarge: "xl",
  xxlarge: "2xl",
  xxl: "2xl",
  xxxlarge: "3xl",
  xxxl: "3xl",
  xxxxl: "4xl",
  xxxxxl: "5xl",
  onesize: "osfa",
  onesizefitsall: "osfa",
  os: "osfa",
  "o/s": "osfa",
  osfm: "osfa",
}

/** Comparison key: "X-Large", "XL", " xl " → "xl"; "XXL" and "2XL" → "2xl". */
export function sizeKey(raw: string | null | undefined): string {
  const k = String(raw ?? "").toLowerCase().replace(/[\s\-_.]/g, "")
  return SIZE_WORDS[k] ?? k
}

/** How a size is shown and stored: "medium" → "M", "xxl" → "2XL", "34" → "34". */
export const normaliseSize = (raw: string | null | undefined): string => sizeKey(raw).toUpperCase()

const LETTER_ORDER = ["4xs", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"]

/** Sort rank: letter sizes, then numbers, then anything else (OSFA last). */
export function sizeRank(raw: string): number {
  const k = sizeKey(raw)
  const i = LETTER_ORDER.indexOf(k)
  if (i >= 0) return i
  const n = Number.parseFloat(k)
  return Number.isFinite(n) ? 100 + n : 10000
}

const looksLikeSize = (cell: string): boolean => {
  const k = sizeKey(cell)
  return LETTER_ORDER.includes(k) || k === "osfa" || /^\d{1,2}(k|y|yr|yrs)?$/.test(k)
}

// ── Columns ─────────────────────────────────────────────────────────────────

const header = (cell: string) => cell.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim()

const HEADER_ALIASES: Array<[RegExp, SizeListColumn]> = [
  [/^(first|given)( name)?$/, "first_name"],
  [/^(last|sur|family)( ?name)?$/, "last_name"],
  [/^(full )?name$|^(player|member|staff|employee|person|participant|student)( name)?$/, "name"],
  [/^(unit|team|squad|section|platoon|troop|company|coy|department|dept|division|group|class|grade|crew|site|branch)( name)?$/, "unit"],
  [/^(#|no|num|number|player (no|number|#)|jersey( (no|number|#))?|shirt (no|number))$/, "number"],
  [/^(notes?|comments?)$/, "notes"],
  [/^(top|tops|shirt|tee|t shirt|polo|hoodie|jumper|jacket|jersey size|singlet)( size)?$/, "size:tops"],
  [/^(bottom|bottoms|shorts?|pants?|trousers?|skirt)( size)?$/, "size:bottoms"],
  [/^(hat|cap|head|headwear|beanie)( size)?$/, "size:headwear"],
  [/^(size|sizes|garment size|uniform size)$/, "size"],
]

const columnForHeader = (cell: string): SizeListColumn | null =>
  HEADER_ALIASES.find(([re]) => re.test(header(cell)))?.[1] ?? null

/**
 * Work out what each column is. With a header row, by its words (any order,
 * common spellings). Without one, by what the cells look like: a column of
 * sizes is the size, short numbers are the number, the first text column is
 * the name and the next one the unit.
 */
export function matchColumns(table: string[][]): { columns: Array<SizeListColumn | null>; hasHeader: boolean } {
  const width = table.reduce((w, r) => Math.max(w, r.length), 0)
  const first = table[0] ?? []
  const fromHeader = Array.from({ length: width }, (_, i) => columnForHeader(first[i] ?? ""))
  if (fromHeader.some((c) => c === "name" || c === "first_name" || c === "last_name" || c?.startsWith("size"))) {
    // Only the first column of each kind counts.
    const seen = new Set<string>()
    return {
      hasHeader: true,
      columns: fromHeader.map((c) => (c && !seen.has(c) ? (seen.add(c), c) : null)),
    }
  }

  const share = (i: number, test: (cell: string) => boolean) => {
    const cells = table.map((r) => r[i] ?? "").filter(Boolean)
    return cells.length ? cells.filter(test).length / cells.length : 0
  }
  const columns: Array<SizeListColumn | null> = Array.from({ length: width }, () => null)
  const letterSize = (c: string) => looksLikeSize(c) && !/^\d+$/.test(c)
  let sizeAt = columns.findIndex((_, i) => share(i, letterSize) >= 0.6)
  if (sizeAt < 0) sizeAt = columns.findIndex((_, i) => share(i, looksLikeSize) >= 0.8 && share(i, (c) => /^\d+$/.test(c)) < 1)
  if (sizeAt >= 0) columns[sizeAt] = "size"
  const numberAt = columns.findIndex((c, i) => c === null && share(i, (cell) => /^#?\d{1,3}$/.test(cell)) >= 0.8)
  if (numberAt >= 0) {
    // A lone numeric column with no letter sizes is more likely the size (8, 10, 12).
    columns[numberAt] = sizeAt >= 0 ? "number" : "size"
  }
  const text = columns.map((c, i) => (c === null && share(i, (cell) => /[a-z]/i.test(cell)) >= 0.6 ? i : -1)).filter((i) => i >= 0)
  if (text[0] !== undefined) columns[text[0]] = "name"
  if (text[1] !== undefined) columns[text[1]] = "unit"
  return { columns, hasHeader: false }
}

// ── People ──────────────────────────────────────────────────────────────────

export type SizeListOptions = {
  /** Where a plain "Size" column goes. */
  defaultGroup?: string
  /** Sizes the garments really come in, per group. Others are flagged. */
  knownSizes?: Record<string, string[]>
  /** Names already on the roster — a repeat is flagged. */
  existingNames?: string[]
  /** The buyer's own column choices from the preview (overrides the guess). */
  columns?: Array<SizeListColumn | null>
}

const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

/** Text → people, with every problem attached to its row. Nothing is saved here. */
export function parseSizeList(text: string, opts: SizeListOptions = {}): SizeListResult {
  const table = parseDelimited(text)
  const guessed = matchColumns(table)
  const columns = opts.columns ?? guessed.columns
  const defaultGroup = opts.defaultGroup ?? "tops"
  const body = guessed.hasHeader ? table.slice(1) : table
  const seen = new Set((opts.existingNames ?? []).map(nameKey))
  const known = Object.fromEntries(
    Object.entries(opts.knownSizes ?? {}).map(([g, sizes]) => [g, new Set(sizes.map(sizeKey))])
  )

  const rows: SizeListRow[] = []
  body.forEach((cells, index) => {
    const get = (col: SizeListColumn) => {
      const i = columns.indexOf(col)
      return i >= 0 ? (cells[i] ?? "").trim() : ""
    }
    const name = (get("name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim()
    const sizes: Record<string, string> = {}
    columns.forEach((col, i) => {
      if (!col || !(col === "size" || col.startsWith("size:"))) return
      const value = (cells[i] ?? "").trim()
      if (!value) return
      const group = col === "size" ? defaultGroup : col.slice(5)
      if (!sizes[group]) sizes[group] = normaliseSize(value)
    })

    const problems: string[] = []
    if (!name) problems.push("No name")
    else if (seen.has(nameKey(name))) problems.push("Name already on the list")
    if (name) seen.add(nameKey(name))
    if (Object.keys(sizes).length === 0) problems.push("No size")
    for (const [group, size] of Object.entries(sizes)) {
      const allowed = known[group]
      const ok = allowed && allowed.size ? allowed.has(sizeKey(size)) : looksLikeSize(size)
      if (!ok) problems.push(`Check size "${size}"`)
    }
    rows.push({
      line: index + 1 + (guessed.hasHeader ? 1 : 0),
      cells,
      name,
      unit: get("unit") || null,
      number: get("number").replace(/^#/, "") || null,
      sizes,
      notes: get("notes") || null,
      problems,
    })
  })

  return {
    columns,
    hasHeader: guessed.hasHeader,
    rows,
    problemCount: rows.filter((r) => r.problems.length > 0).length,
    genericSize: columns.includes("size") && !columns.some((c) => c?.startsWith("size:")),
  }
}

// ── Counting sizes into an order ────────────────────────────────────────────

/** How many people wear each size in a garment group. Keyed by sizeKey. */
export function countSizes(
  people: Array<{ sizes?: Record<string, string | undefined> | null }>,
  group: string
): { counts: Record<string, number>; missing: number } {
  const counts: Record<string, number> = {}
  let missing = 0
  for (const p of people) {
    const key = sizeKey(p.sizes?.[group])
    if (!key) missing++
    else counts[key] = (counts[key] ?? 0) + 1
  }
  return { counts, missing }
}

/** Size counts → quantity per variant. Sizes the garment lacks come back in `unmatched`. */
export function quantitiesForVariants(
  counts: Record<string, number>,
  variants: Array<{ id: string; size: string }>
): { byVariant: Record<string, number>; unmatched: Array<{ size: string; count: number }> } {
  const byKey = new Map(variants.map((v) => [sizeKey(v.size), v.id]))
  const byVariant: Record<string, number> = {}
  const unmatched: Array<{ size: string; count: number }> = []
  for (const [key, count] of Object.entries(counts)) {
    const id = byKey.get(key)
    if (id) byVariant[id] = (byVariant[id] ?? 0) + count
    else unmatched.push({ size: key.toUpperCase(), count })
  }
  return { byVariant, unmatched }
}

/** The sizes each garment group really comes in, from the range's garments. */
export function knownSizesByGroup(
  items: Array<{ garment_group: string | null; variants: Array<{ size: string }> }>
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const item of items) {
    if (!item.garment_group) continue
    const list = (out[item.garment_group] ??= [])
    for (const v of item.variants) if (!list.includes(v.size)) list.push(v.size)
  }
  return out
}
