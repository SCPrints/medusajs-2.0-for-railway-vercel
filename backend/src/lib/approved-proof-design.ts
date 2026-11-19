/**
 * Re-orders replay the artwork staff approved, not the customer's first
 * upload. A revised proof saved from the Studio carries `design` (the proof
 * canvas objects); this swaps each proofed side's objects into the line's
 * `customizerDesign`, rescaled from the proof canvas to the design canvas.
 *
 * Pure, no framework imports (admin-safe). Mirrored in the storefront —
 * keep the two in step. Callers must restore archived sideLayouts first
 * (lib/side-layouts-archive.ts `restoreSideLayouts`): an empty inline
 * `sideLayouts` plus `sideLayouts_archived_url` would otherwise lose the
 * sides no proof covers.
 */

type Canvas = { width: number; height: number }

export type ProofWithDesign = {
  id?: string
  url?: string
  /** Raw approved artwork staff positioned (what production prints from). */
  artwork_url?: string | null
  line_item_id?: string
  side?: string
  uploaded_at?: string
  design?: {
    objects?: unknown[]
    canvas?: { width?: number; height?: number }
    print_size_id?: string | null
  } | null
}

export type MergeApprovedProofsResult<T> = {
  design: T
  /** Sides whose objects now come from an approved proof. */
  replacedSides: string[]
  /** The proof used per replaced side (its `url` is the approved mockup). */
  appliedProofs: Array<{
    side: string
    proof_id: string | null
    url: string | null
    artwork_url: string | null
  }>
}

/** 4:5 garment frame — storefront print-geometry FRAME_ASPECT. */
const FRAME_ASPECT = 1.25

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)

const validCanvas = (c: unknown): Canvas | null => {
  if (!isObj(c)) return null
  const width = Number(c.width)
  const height = Number(c.height)
  return width > 0 && height > 0 ? { width, height } : null
}

/** Same rule as the storefront's savedCanvasSize: saved canvas, else printArea on the 4:5 frame. */
export function designCanvasSize(design: Record<string, any>): Canvas | null {
  const saved = validCanvas(design.canvas)
  if (saved) return saved
  const p = design.printArea
  const width = 2 * Number(p?.x) + Number(p?.width)
  return Number.isFinite(width) && width > 0 ? { width, height: width * FRAME_ASPECT } : null
}

const rescale = (obj: unknown, sx: number, sy: number): unknown => {
  if (!isObj(obj)) return obj
  const next = { ...obj }
  if (typeof next.left === "number") next.left = next.left * sx
  if (typeof next.top === "number") next.top = next.top * sy
  if (typeof next.scaleX === "number") next.scaleX = next.scaleX * sx
  if (typeof next.scaleY === "number") next.scaleY = next.scaleY * sy
  return next
}

export function mergeApprovedProofs<T>(
  customizerDesign: T,
  revisedProofs: unknown,
  lineItemId: string
): MergeApprovedProofsResult<T> {
  if (!isObj(customizerDesign) || !Array.isArray(revisedProofs)) {
    return { design: customizerDesign, replacedSides: [], appliedProofs: [] }
  }

  // Newest proof with a usable design, per side. Array order breaks ties
  // (proofs are appended), so a later entry with the same stamp wins.
  const newest = new Map<string, { proof: ProofWithDesign; at: number; index: number }>()
  revisedProofs.forEach((raw, index) => {
    const proof = raw as ProofWithDesign
    if (!isObj(proof) || proof.line_item_id !== lineItemId) return
    if (typeof proof.side !== "string" || !proof.side) return
    if (!proof.design || !Array.isArray(proof.design.objects) || !validCanvas(proof.design.canvas)) return
    const at = Date.parse(proof.uploaded_at ?? "") || 0
    const prev = newest.get(proof.side)
    if (!prev || at > prev.at || (at === prev.at && index > prev.index)) {
      newest.set(proof.side, { proof, at, index })
    }
  })
  if (newest.size === 0) return { design: customizerDesign, replacedSides: [], appliedProofs: [] }

  const source = customizerDesign as Record<string, any>
  const target = designCanvasSize(source)
  const layouts: Array<Record<string, any>> = Array.isArray(source.sideLayouts)
    ? source.sideLayouts.map((l: unknown) => (isObj(l) ? { ...l } : l))
    : []
  const printSizes: Record<string, string> = isObj(source.approvedPrintSizeBySide)
    ? { ...source.approvedPrintSizeBySide }
    : {}

  const replacedSides: string[] = []
  const appliedProofs: MergeApprovedProofsResult<T>["appliedProofs"] = []
  for (const [side, { proof }] of newest) {
    const design = proof.design!
    const from = validCanvas(design.canvas)!
    // ponytail: no derivable design canvas → keep proof coordinates as-is.
    const sx = target ? target.width / from.width : 1
    const sy = target ? target.height / from.height : 1
    const objects = (design.objects ?? []).map((o) => rescale(o, sx, sy))
    const existing = layouts.find((l) => isObj(l) && l.side === side)
    if (existing) existing.objects = objects
    else layouts.push({ side, objects })
    if (typeof design.print_size_id === "string" && design.print_size_id) {
      printSizes[side] = design.print_size_id
    }
    replacedSides.push(side)
    appliedProofs.push({
      side,
      proof_id: typeof proof.id === "string" ? proof.id : null,
      url: typeof proof.url === "string" && proof.url ? proof.url : null,
      artwork_url:
        typeof proof.artwork_url === "string" && proof.artwork_url ? proof.artwork_url : null,
    })
  }

  return {
    design: {
      ...source,
      sideLayouts: layouts,
      ...(Object.keys(printSizes).length ? { approvedPrintSizeBySide: printSizes } : {}),
    } as T,
    replacedSides,
    appliedProofs,
  }
}
