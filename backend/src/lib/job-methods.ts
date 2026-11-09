/**
 * How a job is decorated, for the board's badges and filter. Read from the
 * Studio design on each line and from the Job pricer's saved positions.
 * Admin-safe (no framework imports).
 */
export const JOB_METHODS = ["DTF", "Supacolour", "Screen", "Embroidery"] as const
export type JobMethod = (typeof JOB_METHODS)[number]

const label = (method: unknown, channel?: unknown): JobMethod | null =>
  method === "screen" ? "Screen" : method === "embroidery" ? "Embroidery" : method === "print" ? (channel === "supacolour" ? "Supacolour" : "DTF") : null

// ponytail: a Studio print on a Supacolour-flagged garment reads as DTF here
// (the flag lives on the product); look the product up if the press needs it.
export function jobMethods(lines: Array<{ customizerDesign?: any; metadata?: any }>, pricerState?: any): JobMethod[] {
  const found = new Set<JobMethod>()
  for (const l of lines) {
    const design = l.customizerDesign ?? l.metadata?.customizerDesign
    if (!design || typeof design !== "object") continue
    const methods = (design.sideDecorationMethods ?? {}) as Record<string, unknown>
    const drawn = (Array.isArray(design.artifacts) ? design.artifacts : []).map((a: any) => a?.side).filter((s: unknown) => typeof s === "string")
    for (const side of drawn.length ? drawn : Object.keys(methods)) {
      const m = label(methods[side] ?? "print")
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
