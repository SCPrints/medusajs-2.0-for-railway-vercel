/**
 * Canonical apparel size ordering for PDP size pickers and customizer size matrices.
 * Primary sequence: XS → S → M → L → XL → 2XL → 3XL → 4XL → 5XL
 */
const BASE_ORDER = [
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "one size",
  "os",
  "o/s",
] as const

const normalizeSizeKey = (raw: string): string => {
  const k = raw.toLowerCase().trim()
  if (k === "xxl") {
    return "2xl"
  }
  if (k === "xxxl") {
    return "3xl"
  }
  return k
}

const rank = (label: string): number => {
  const key = normalizeSizeKey(label)
  const idx = (BASE_ORDER as readonly string[]).indexOf(key)
  if (idx !== -1) {
    return idx
  }
  const n = parseFloat(key.replace(/[^0-9.]/g, ""))
  if (!Number.isNaN(n)) {
    return 100 + n
  }
  return 1000 + key.charCodeAt(0)
}

export const sortApparelSizeLabels = (sizes: string[]): string[] =>
  [...sizes].sort((a, b) => rank(a) - rank(b))
