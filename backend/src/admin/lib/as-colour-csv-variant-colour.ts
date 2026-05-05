/**
 * Resolve garment colour from a Medusa import-template row (parseCsv keys are lowercase).
 * Used when matching ProductImage-V1 descriptions and when writing variant garment_color metadata.
 */

const isColourOptionName = (name: string): boolean => /colou?r/i.test(name.trim())

/** Medusa exports often omit Variant Option 2; colour appears after `" / "` (e.g. `XS / BLACK`). */
export function colourFromVariantTitle(title: string): string | undefined {
  const t = title.trim()
  if (!t) {
    return undefined
  }
  const sep = " / "
  const idx = t.lastIndexOf(sep)
  if (idx === -1) {
    return undefined
  }
  const right = t.slice(idx + sep.length).trim()
  return right || undefined
}

/**
 * Single-option Colour products: option 1 is Colour.
 * Size × Colour: option 1 Size, option 2 Colour (when present), or colour only in Variant Title.
 */
export function resolveVariantColourFromCsvRow(row: Record<string, string>): string | undefined {
  const n1 = (row["variant option 1 name"] ?? "").trim()
  const v1 = (row["variant option 1 value"] ?? "").trim()
  const n2 = (row["variant option 2 name"] ?? "").trim()
  const v2 = (row["variant option 2 value"] ?? "").trim()
  const title = (row["variant title"] ?? "").trim()

  if (isColourOptionName(n1) && v1) {
    return v1
  }
  if (isColourOptionName(n2) && v2) {
    return v2
  }
  if (v1 && v2 && /size|one size/i.test(n1)) {
    return v2
  }
  if (v1 && v2 && !isColourOptionName(n1)) {
    return v2
  }

  const fromTitle = colourFromVariantTitle(title)
  if (fromTitle) {
    return fromTitle
  }

  return v1 || v2 || undefined
}
