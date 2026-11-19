import { savedCanvasSize } from "./print-geometry"
import type { CustomizerMetadata } from "./types"

/**
 * Mirror of backend/src/lib/approved-proof-design.ts. When staff fix a
 * customer's artwork in "Create revised proof", the proof carries that side's
 * Fabric objects. A re-order must reprint THAT, not the customer's first
 * upload, so each side with a proof design takes the newest one's objects,
 * rescaled from the proof canvas into the design's canvas.
 */
export type ProofDesign = {
  objects: unknown[]
  canvas: { width: number; height: number }
  print_size_id?: string
}

type RevisedProofLike = {
  line_item_id?: string
  side?: string
  uploaded_at?: string
  design?: ProofDesign | null
}

const SIZE_IDS = ["up_to_a6", "up_to_a4", "up_to_a3", "oversize"]

export function mergeApprovedProofs(
  design: CustomizerMetadata,
  revisedProofs: unknown,
  lineItemId: string
): { design: CustomizerMetadata; replacedSides: string[] } {
  const proofs = (Array.isArray(revisedProofs) ? revisedProofs : []) as RevisedProofLike[]
  const newestBySide = new Map<string, RevisedProofLike>()
  for (const p of proofs) {
    if (p?.line_item_id !== lineItemId || typeof p.side !== "string") continue
    const d = p.design
    if (!d || !Array.isArray(d.objects) || !(d.canvas?.width > 0) || !(d.canvas?.height > 0)) continue
    const cur = newestBySide.get(p.side)
    if (!cur || String(p.uploaded_at ?? "") > String(cur.uploaded_at ?? "")) newestBySide.set(p.side, p)
  }
  if (newestBySide.size === 0) return { design, replacedSides: [] }

  const target = savedCanvasSize(design)
  const sideLayouts = [...(design.sideLayouts ?? [])]
  let prints = design.prints ? [...design.prints] : design.prints
  for (const [side, proof] of Array.from(newestBySide.entries())) {
    const d = proof.design as ProofDesign
    const sx = target ? target.width / d.canvas.width : 1
    const sy = target ? target.height / d.canvas.height : 1
    const objects = d.objects.map((o) => {
      if (!o || typeof o !== "object") return o
      const next = { ...(o as Record<string, unknown>) }
      for (const [k, s] of [["left", sx], ["top", sy], ["scaleX", sx], ["scaleY", sy]] as const) {
        if (typeof next[k] === "number") next[k] = (next[k] as number) * s
      }
      return next
    }) as Record<string, unknown>[]
    const idx = sideLayouts.findIndex((sl) => sl?.side === side)
    const layout = { side: side as CustomizerMetadata["sideLayouts"][number]["side"], objects }
    if (idx >= 0) sideLayouts[idx] = layout
    else sideLayouts.push(layout)
    if (prints && d.print_size_id && SIZE_IDS.includes(d.print_size_id)) {
      prints = prints.map((p) =>
        p?.side === side ? { ...p, sizeId: d.print_size_id as typeof p.sizeId, manualSize: false } : p
      )
    }
  }
  return {
    design: { ...design, sideLayouts, ...(prints ? { prints } : {}) },
    replacedSides: Array.from(newestBySide.keys()),
  }
}
