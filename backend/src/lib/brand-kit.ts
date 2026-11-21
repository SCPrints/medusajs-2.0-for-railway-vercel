/**
 * Organisation brand kit: approved colours, fonts, placement notes and which
 * shared artwork files are the official logos. Pure — the admin bundle can use
 * the type. Stored as-is on `organisation.brand_kit`.
 */
export const BRAND_KIT_MAX_COLOURS = 24
export const BRAND_KIT_MAX_FONTS = 10
export const BRAND_KIT_MAX_NOTES = 2000
export const BRAND_KIT_MAX_LOGOS = 20

export type BrandKit = {
  colours: Array<{ name: string; hex: string; pantone: string | null }>
  fonts: string[]
  placement_notes: string
  logo_artwork_ids: string[]
}

export const EMPTY_BRAND_KIT: BrandKit = { colours: [], fonts: [], placement_notes: "", logo_artwork_ids: [] }

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max) : ""

/** "#abc" / "#AABBCC" → "#AABBCC"; null when it is not a hex colour. */
export function normaliseHex(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : ""
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return `#${h.toUpperCase()}`
}

/** Validate a kit from the browser. Too many items or a bad hex is an error, never trimmed quietly. */
export function cleanBrandKit(raw: unknown): { ok: true; kit: BrandKit } | { ok: false; error: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const colours = Array.isArray(r.colours) ? r.colours : []
  const fonts = Array.isArray(r.fonts) ? r.fonts : []
  const logos = Array.isArray(r.logo_artwork_ids) ? r.logo_artwork_ids : []
  if (colours.length > BRAND_KIT_MAX_COLOURS) return { ok: false, error: `Up to ${BRAND_KIT_MAX_COLOURS} colours.` }
  if (fonts.length > BRAND_KIT_MAX_FONTS) return { ok: false, error: `Up to ${BRAND_KIT_MAX_FONTS} fonts.` }
  if (logos.length > BRAND_KIT_MAX_LOGOS) return { ok: false, error: `Up to ${BRAND_KIT_MAX_LOGOS} logos.` }
  if (typeof r.placement_notes === "string" && r.placement_notes.length > BRAND_KIT_MAX_NOTES) {
    return { ok: false, error: `Placement notes are limited to ${BRAND_KIT_MAX_NOTES} characters.` }
  }
  const outColours: BrandKit["colours"] = []
  for (const c of colours) {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {}
    const name = clean(o.name, 60)
    const hex = normaliseHex(o.hex)
    if (!name) return { ok: false, error: "Give every colour a name." }
    if (!hex) return { ok: false, error: `"${name}" needs a hex colour like #1A2B3C.` }
    outColours.push({ name, hex, pantone: clean(o.pantone, 40) || null })
  }
  return {
    ok: true,
    kit: {
      colours: outColours,
      fonts: Array.from(new Set(fonts.map((f) => clean(f, 60)).filter(Boolean))),
      placement_notes: clean(r.placement_notes, BRAND_KIT_MAX_NOTES + 1).slice(0, BRAND_KIT_MAX_NOTES),
      logo_artwork_ids: Array.from(new Set(logos.map((l) => clean(l, 80)).filter(Boolean))),
    },
  }
}

/** What is stored may be empty / old: always a full kit. */
export function readBrandKit(raw: unknown): BrandKit {
  const res = cleanBrandKit(raw)
  return res.ok ? res.kit : EMPTY_BRAND_KIT
}
