/**
 * Pins a customer drops on a proof image to say "this spot, change this".
 * x / y are 0..1 fractions of the image, so they survive any display size.
 * Pure (no framework imports) — the admin bundle and the storefront mirror use it too.
 */
export type ProofPin = { image_index: number; x: number; y: number; note: string }

export const MAX_PROOF_PINS = 20
export const MAX_PIN_NOTE = 300

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Keeps valid pins only: finite numbers, trimmed note, max 20. Never throws. */
export function cleanProofPins(input: unknown): ProofPin[] {
  if (!Array.isArray(input)) return []
  const out: ProofPin[] = []
  for (const raw of input) {
    if (out.length >= MAX_PROOF_PINS) break
    if (!raw || typeof raw !== "object") continue
    const p = raw as Record<string, unknown>
    const idx = Number(p.image_index)
    const x = Number(p.x)
    const y = Number(p.y)
    if (!Number.isInteger(idx) || idx < 0 || idx > 200) continue
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push({
      image_index: idx,
      x: clamp01(x),
      y: clamp01(y),
      note: (typeof p.note === "string" ? p.note : "").trim().slice(0, MAX_PIN_NOTE),
    })
  }
  return out
}
