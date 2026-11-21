import {
  bareLineProofs,
  buildLineCustomizerExport,
  lineMockupGroupKey,
} from "../../lib/customizer-order-artifacts"
import { cleanProofPins, type ProofPin } from "../../lib/proof-pins"

/**
 * The proof the customer is asked to approve (mockups with staff notes, stage,
 * last decision, pins of the last change request). Shared by the signed link
 * route and the account route so both show exactly the same thing.
 * `order` needs `items`.
 */
export function buildProofPayload(order: any) {
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const photos = Array.isArray(meta.production_photos)
    ? (meta.production_photos as Array<{ url?: string; uploaded_at?: string }>)
    : []
  const latestPhotoUrl =
    photos
      .filter((p) => typeof p?.url === "string" && p.url.length > 0)
      .sort((a, b) =>
        (a.uploaded_at ?? "") < (b.uploaded_at ?? "") ? 1 : -1
      )[0]?.url ?? null

  const revisedProofs = Array.isArray(meta.revised_proofs)
    ? (meta.revised_proofs as Array<{
        line_item_id?: string
        side?: string
        url?: string
        uploaded_at?: string
        note?: string | null
      }>)
    : []

  const hasPerSideProofs = revisedProofs.some((p) => p.line_item_id)

  // Staff-authored per-side "studio note" shown UNDER each mockup on the
  // approval page. Keyed by `${line_item_id}:${side}` — same key the admin
  // mockup-note route writes and `buildLineCustomizerExport` artifact sides use.
  const rawStudioNotes = (meta as { mockup_studio_notes?: unknown }).mockup_studio_notes
  const studioNotes: Record<string, string> =
    rawStudioNotes && typeof rawStudioNotes === "object" && !Array.isArray(rawStudioNotes)
      ? (rawStudioNotes as Record<string, string>)
      : {}

  // Staff-authored per-side print-dimension override (e.g. "8.75×3.5cm"), shown
  // UNDER each mockup next to the studio note. Same `${line_item_id}:${side}`
  // key as the admin print-dimension route writes. Falls back to nothing when
  // unset — the page simply omits the dimension line.
  const rawDimensions = (meta as { mockup_print_dimensions?: unknown }).mockup_print_dimensions
  const printDimensions: Record<string, string> =
    rawDimensions && typeof rawDimensions === "object" && !Array.isArray(rawDimensions)
      ? (rawDimensions as Record<string, string>)
      : {}

  // Build mockup URL list, merging per-side revised proofs where available.
  // Backward compat: if proofs lack line_item_id, fall back to single-image behaviour.
  let mockupUrls: Array<{
    side: string
    side_label: string | null
    url: string
    note: string | null
    print_dimension: string | null
  }> = []
  let legacyProofUrl: string | null = null
  let legacyProofNote: string | null = null

  // One mockup per (design group, colourway, side): the same design ordered
  // across N size lines repeats identical mockups otherwise. Notes, print
  // dimensions, and proofs are stored keyed by `${line_item_id}:${side}`, so
  // translate line ids to group keys — an entry on ANY line in the group
  // applies to the kept representative image.
  const groupKeyOfLine = new Map<string, string>()
  for (const line of order.items ?? []) {
    groupKeyOfLine.set(line.id as string, lineMockupGroupKey(line))
  }
  const toGroupKeyed = (rec: Record<string, string>) => {
    const out = new Map<string, string>()
    for (const [k, v] of Object.entries(rec)) {
      const idx = k.indexOf(":")
      if (idx === -1) continue
      const gk = groupKeyOfLine.get(k.slice(0, idx)) ?? k.slice(0, idx)
      const nk = `${gk}:${k.slice(idx + 1)}`
      if (!out.has(nk)) out.set(nk, v)
    }
    return out
  }
  const groupStudioNotes = toGroupKeyed(studioNotes)
  const groupPrintDimensions = toGroupKeyed(printDimensions)

  const seen = new Set<string>()
  const rawArtifacts = (order.items ?? []).flatMap((line: any) => {
    const exp = buildLineCustomizerExport(line)
    return (exp?.artifacts ?? [])
      .filter((a: any) => a.mockup_url && !a.mockup_url_inline_omitted)
      .map((a: any) => ({
        groupKey: groupKeyOfLine.get(line.id) as string,
        side: a.side as string,
        side_label: a.side_label as string | null,
        url: a.mockup_url as string,
      }))
      .filter((a: any) => {
        const k = `${a.groupKey}:${a.side}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  })

  if (hasPerSideProofs) {
    const latestBySideKey = new Map<string, string>()
    const latestNoteBySideKey = new Map<string, string>()
    ;[...revisedProofs]
      .filter((p) => p.line_item_id && p.side && p.url)
      .sort((a, b) => ((a.uploaded_at ?? "") < (b.uploaded_at ?? "") ? 1 : -1))
      .forEach((p) => {
        const gk = groupKeyOfLine.get(p.line_item_id!) ?? p.line_item_id!
        const k = `${gk}:${p.side}`
        if (!latestBySideKey.has(k)) {
          latestBySideKey.set(k, p.url!)
          // Capture the note from the SAME (latest) proof, if any.
          if (typeof p.note === "string" && p.note.trim()) {
            latestNoteBySideKey.set(k, p.note.trim())
          }
        }
      })
    mockupUrls = rawArtifacts.map((a) => {
      const k = `${a.groupKey}:${a.side}`
      return {
        side: a.side,
        side_label: a.side_label,
        url: latestBySideKey.get(k) ?? a.url,
        // Explicit studio note wins; else fall back to the latest proof's note.
        note: groupStudioNotes.get(k) ?? latestNoteBySideKey.get(k) ?? null,
        print_dimension: groupPrintDimensions.get(k) ?? null,
      }
    })
    for (const p of bareLineProofs(order.items ?? [], revisedProofs)) {
      mockupUrls.push({
        side: p.side,
        side_label: p.side_label,
        url: p.url,
        note: studioNotes[p.key] ?? p.note,
        print_dimension: printDimensions[p.key] ?? null,
      })
    }
  } else {
    const latestRevisedProof = revisedProofs
      .filter((p) => typeof p?.url === "string" && p.url!.length > 0)
      .sort((a, b) => ((a.uploaded_at ?? "") < (b.uploaded_at ?? "") ? 1 : -1))[0] ?? null

    if (latestRevisedProof?.url) {
      legacyProofUrl = latestRevisedProof.url
      legacyProofNote = latestRevisedProof.note ?? null
    } else {
      mockupUrls = rawArtifacts.map((a) => {
        const k = `${a.groupKey}:${a.side}`
        return {
          side: a.side,
          side_label: a.side_label,
          url: a.url,
          note: groupStudioNotes.get(k) ?? null,
          print_dimension: groupPrintDimensions.get(k) ?? null,
        }
      })
    }
  }

  return {
    order_id: order.id,
    order_display_id:
      typeof order.display_id === "number" ? order.display_id : null,
    artwork_stage: typeof meta.artwork_stage === "string" ? meta.artwork_stage : null,
    artwork_approved_at:
      typeof meta.artwork_approved_at === "string"
        ? meta.artwork_approved_at
        : null,
    artwork_approver_name:
      typeof meta.artwork_approver_name === "string"
        ? meta.artwork_approver_name
        : null,
    latest_photo_url: legacyProofUrl ?? latestPhotoUrl,
    revised_proof_note: legacyProofNote,
    mockup_urls: mockupUrls,
    change_pins: lastChangePins(meta),
  }
}

export type ProofPayload = ReturnType<typeof buildProofPayload>

/** Pins of the most recent change request, saved by decide.ts. */
function lastChangePins(meta: Record<string, unknown>): ProofPin[] {
  const saved = meta.artwork_change_pins as { pins?: unknown } | undefined
  return cleanProofPins(saved?.pins)
}
