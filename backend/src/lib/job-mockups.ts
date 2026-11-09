/**
 * The mockup pictures for a job's board card: each line's Studio mockup per
 * side, replaced by the newest revised proof staff made for that line + side
 * (same rule as the mockup PDF and the DSP pack). Deduped, http URLs only.
 */
type Line = { id?: string; customizerDesign?: any; metadata?: any }

const http = (u: unknown): u is string => typeof u === "string" && /^https?:/.test(u)

export function jobMockups(lines: Line[], revisedProofs: unknown, max = 4): string[] {
  const byKey = new Map<string, string>()
  for (const l of lines) {
    const design = l.customizerDesign ?? l.metadata?.customizerDesign
    for (const a of Array.isArray(design?.artifacts) ? design.artifacts : []) {
      if (http(a?.mockupUrl)) byKey.set(`${l.id}:${a.side ?? "front"}`, a.mockupUrl)
    }
  }
  const proofs = (Array.isArray(revisedProofs) ? [...revisedProofs] : [])
    .filter((p) => p?.line_item_id && http(p?.url))
    .sort((a, b) => String(a.uploaded_at ?? "").localeCompare(String(b.uploaded_at ?? "")))
  for (const p of proofs) byKey.set(`${p.line_item_id}:${p.side ?? "front"}`, p.url)
  return [...new Set(byKey.values())].slice(0, max)
}
