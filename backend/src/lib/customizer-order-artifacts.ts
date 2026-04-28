/**
 * Extract Fabric customizer `customizerDesign` from order line metadata for Admin / API use.
 */

const MAX_INLINE_DATA_URL_CHARS = 2048

const sideLabel = (side: string) => {
  switch (side) {
    case "front":
      return "Front"
    case "back":
      return "Back"
    case "left_sleeve":
      return "Left sleeve"
    case "right_sleeve":
      return "Right sleeve"
    default:
      return side.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

function sanitizeArtifactUrl(raw: unknown): {
  url: string | null
  inline_omitted: boolean
} {
  if (raw == null || typeof raw !== "string") {
    return { url: null, inline_omitted: false }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return { url: null, inline_omitted: false }
  }
  if (trimmed.startsWith("data:") && trimmed.length > MAX_INLINE_DATA_URL_CHARS) {
    return { url: null, inline_omitted: true }
  }
  return { url: trimmed, inline_omitted: false }
}

export type CustomizerArtifactExport = {
  side: string
  side_label: string
  print_url: string | null
  print_url_inline_omitted: boolean
  mockup_url: string | null
  mockup_url_inline_omitted: boolean
}

export type OrderLineCustomizerExport = {
  line_item_id: string
  product_title: string | null
  variant_title: string | null
  title: string | null
  quantity: number
  has_customizer: boolean
  print_notes: string | null
  artifacts: CustomizerArtifactExport[]
}

export function buildLineCustomizerExport(line: {
  id: string
  title?: string | null
  product_title?: string | null
  variant_title?: string | null
  quantity?: unknown
  metadata?: Record<string, unknown> | null
}): OrderLineCustomizerExport {
  const metadata = line.metadata ?? null
  const rawDesign = metadata?.customizerDesign
  const hasCustomizer =
    rawDesign !== null && typeof rawDesign === "object" && !Array.isArray(rawDesign)

  let printNotes: string | null = null
  const artifacts: CustomizerArtifactExport[] = []

  if (hasCustomizer && rawDesign && typeof rawDesign === "object") {
    const rawNotes = (rawDesign as { printNotes?: unknown }).printNotes
    if (typeof rawNotes === "string" && rawNotes.trim()) {
      printNotes = rawNotes.trim()
    }

    const rawArtifacts = (rawDesign as { artifacts?: unknown }).artifacts
    if (Array.isArray(rawArtifacts)) {
      for (const a of rawArtifacts) {
        if (!a || typeof a !== "object") {
          continue
        }
        const sideRaw = (a as { side?: unknown }).side
        const side = typeof sideRaw === "string" && sideRaw.trim() ? sideRaw.trim() : "unknown"
        const pu = sanitizeArtifactUrl((a as { printUrl?: unknown }).printUrl)
        const mu = sanitizeArtifactUrl((a as { mockupUrl?: unknown }).mockupUrl)
        artifacts.push({
          side,
          side_label: sideLabel(side),
          print_url: pu.url,
          print_url_inline_omitted: pu.inline_omitted,
          mockup_url: mu.url,
          mockup_url_inline_omitted: mu.inline_omitted,
        })
      }
    }
  }

  const q = typeof line.quantity === "number" ? line.quantity : Number(line.quantity)
  const quantity = Number.isFinite(q) ? q : 1

  return {
    line_item_id: line.id,
    product_title: line.product_title ?? null,
    variant_title: line.variant_title ?? null,
    title: line.title ?? null,
    quantity,
    has_customizer: hasCustomizer,
    print_notes: printNotes,
    artifacts,
  }
}
