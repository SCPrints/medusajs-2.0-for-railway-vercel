/**
 * Job lines — pure, admin-safe (no framework imports). Folds the one-row-per-
 * size lines a quote or order carries into one row per garment + colour, so a
 * 3-colour × 6-size polo job is three rows ("S 4 · M 10 · L 10"), not 18.
 */
import type { JobLine } from "./job-view"

export type RawJobLine = {
  id: string
  title: string
  subtitle: string | null
  quantity: number
  unit_price: number | null
  total: number | null
  thumbnail: string | null
  decorated: boolean
  product_id?: string | null
  /** Order items: Medusa's variant option values, e.g. { Color: "Navy", Size: "M" }. */
  option_values?: Record<string, unknown> | null
  /** Quote lines: the pricer's group id (shared by every colour of a group). */
  group_id?: string | null
}

const SIZE_KEY = /size|sizes/i
const SIZE_TOKEN = /^(xxs|xs|s|m|l|xl|\d?xl|[2-9]xl|1[0-9]xl|\d{1,3}|\d{1,2}[a-z]?|one size|os|any)$/i

/** Split a quote line title "Name — Product, Navy / M" into base + size. */
const splitTitle = (title: string): { base: string; size: string | null } => {
  const m = title.match(/^(.*?)\s*\/\s*([^/]+)$/)
  if (m && SIZE_TOKEN.test(m[2].trim())) return { base: m[1].trim(), size: m[2].trim() }
  const any = title.match(/^(.*?)\s*\(any size\)$/i)
  if (any) return { base: any[1].trim(), size: null }
  return { base: title, size: null }
}

/** Group key + display title + size for one raw line. */
export function lineGroup(l: RawJobLine): { key: string; title: string; size: string | null } {
  // Pricer lines: jp_r_<rowId>:<size> — the row is the colour.
  const jp = l.id.match(/^jp_r_(.+?):([^:]+)$/)
  if (jp) {
    const { base } = splitTitle(l.title)
    return { key: `jp_r_${jp[1]}`, title: base, size: jp[2] === "any" ? null : jp[2] }
  }
  const opts = l.option_values && typeof l.option_values === "object" ? l.option_values : null
  if (opts && l.product_id) {
    let size: string | null = null
    const colour: string[] = []
    for (const [k, v] of Object.entries(opts)) {
      if (v == null || v === "") continue
      if (SIZE_KEY.test(k) || (!size && SIZE_TOKEN.test(String(v)))) size = String(v)
      else colour.push(String(v))
    }
    const base = l.title.replace(/\s*\/\s*[^/]+$/, "")
    return { key: `${l.product_id}|${colour.join("/").toLowerCase()}`, title: colour.length ? `${base.split(" / ")[0]} · ${colour.join(" / ")}` : base, size }
  }
  return { key: l.id, title: l.title, size: null }
}

const sizeSort = (a: string, b: string) => {
  const order = ["xxs", "xs", "s", "m", "l", "xl", "2xl", "xxl", "3xl", "4xl", "5xl"]
  const ia = order.indexOf(a.toLowerCase())
  const ib = order.indexOf(b.toLowerCase())
  if (ia >= 0 && ib >= 0) return ia - ib
  if (ia >= 0) return -1
  if (ib >= 0) return 1
  return a.localeCompare(b, undefined, { numeric: true })
}

export function groupJobLines(raw: RawJobLine[], marginFor: (groupKey: string, line: RawJobLine) => number | null = () => null): JobLine[] {
  const groups = new Map<string, { title: string; lines: RawJobLine[]; sizes: Map<string, number> }>()
  for (const l of raw) {
    const g = lineGroup(l)
    let entry = groups.get(g.key)
    if (!entry) {
      entry = { title: g.title, lines: [], sizes: new Map() }
      groups.set(g.key, entry)
    }
    entry.lines.push(l)
    if (g.size) entry.sizes.set(g.size, (entry.sizes.get(g.size) ?? 0) + l.quantity)
  }
  return [...groups.entries()].map(([key, g]) => {
    const first = g.lines[0]
    const quantity = g.lines.reduce((n, l) => n + l.quantity, 0)
    const totals = g.lines.map((l) => l.total).filter((t): t is number => t != null)
    const prices = g.lines.map((l) => l.unit_price).filter((p): p is number => p != null)
    const sizes = [...g.sizes.entries()].sort((a, b) => sizeSort(a[0], b[0])).map(([s, n]) => `${s} ${n}`).join(" · ")
    return {
      id: key,
      title: g.title,
      subtitle: g.lines.length === 1 ? first.subtitle : (first.subtitle ?? null),
      quantity,
      unit_price: prices.length ? Math.min(...prices) : null,
      unit_price_max: prices.length ? Math.max(...prices) : null,
      total: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      thumbnail: g.lines.map((l) => l.thumbnail).find(Boolean) ?? null,
      decorated: g.lines.some((l) => l.decorated),
      sizes: sizes || null,
      line_ids: g.lines.map((l) => l.id),
      margin_pct: marginFor(key, first),
    }
  })
}
