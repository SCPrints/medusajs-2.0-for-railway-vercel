/**
 * How a job is decorated, for the board's badges and filter. Read from the
 * Studio design on each line and from the Job pricer's saved positions.
 * Admin-safe (no framework imports).
 */
export const JOB_METHODS = ["DTF", "Supacolour", "Screen", "Embroidery"] as const
export type JobMethod = (typeof JOB_METHODS)[number]

/** Board colour per method: card edge, tag and filter dot. Red is kept for "our move". */
export const METHOD_COLOUR: Record<JobMethod, string> = {
  DTF: "#3b82f6",
  Supacolour: "#f59e0b",
  Screen: "#a855f7",
  Embroidery: "#10b981",
}

/** Card edge: one colour solid, a mix split into equal arcs around the card. */
export function methodEdge(methods: readonly JobMethod[]): string | null {
  if (!methods.length) return null
  const step = 360 / methods.length
  const stops = methods.map((m, i) => `${METHOD_COLOUR[m]} ${i * step}deg ${(i + 1) * step}deg`)
  return `conic-gradient(from -45deg, ${stops.join(", ")})`
}

const label = (method: unknown, channel?: unknown): JobMethod | null =>
  method === "screen" ? "Screen" : method === "embroidery" ? "Embroidery" : method === "print" ? (channel === "supacolour" ? "Supacolour" : "DTF") : null

// ponytail: a Studio print on a Supacolour-flagged garment reads as DTF here
// (the flag lives on the product); look the product up if the press needs it.
export function jobMethods(lines: Array<{ customizerDesign?: any; metadata?: any; group_id?: any }>, pricerState?: any): JobMethod[] {
  const found = new Set<JobMethod>()
  // Groups the Job pricer priced: their positions below say the technique.
  const priced = new Set(
    (Array.isArray(pricerState?.groups) ? pricerState.groups : [])
      .filter((g: any) => g?.id && Array.isArray(g.positions) && g.positions.length)
      .map((g: any) => String(g.id)),
  )
  for (const l of lines) {
    const design = l.customizerDesign ?? l.metadata?.customizerDesign
    if (!design || typeof design !== "object") continue
    const methods = (design.sideDecorationMethods ?? {}) as Record<string, unknown>
    // A Studio mockup on a priced group leaves sides unset (Studio defaults to
    // print); don't read that as DTF on a screen job — the pricer covers it.
    const groupId = l.group_id ?? l.metadata?.group_id
    const fallback = groupId && priced.has(String(groupId)) ? null : "print"
    const drawn = (Array.isArray(design.artifacts) ? design.artifacts : []).map((a: any) => a?.side).filter((s: unknown) => typeof s === "string")
    for (const side of drawn.length ? drawn : Object.keys(methods)) {
      const m = label(methods[side] ?? fallback)
      if (m) found.add(m)
    }
  }
  for (const g of Array.isArray(pricerState?.groups) ? pricerState.groups : []) {
    for (const p of Array.isArray(g?.positions) ? g.positions : []) {
      const m = label(p?.method, p?.channel)
      if (m) found.add(m)
    }
  }
  return JOB_METHODS.filter((m) => found.has(m))
}
