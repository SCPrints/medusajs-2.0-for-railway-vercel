/**
 * Extract a numeric GSM value from a free-text string.
 * Handles "320 GSM", "190gsm", "7.5 oz / 255 GSM", "200 g/m²".
 * Returns null if no recognisable GSM pattern is found.
 */
export function parseGsm(s: string | number | null | undefined): number | null {
  const m = String(s ?? "").match(/(\d+)\s*g(?:sm|\/m)/i)
  return m ? parseInt(m[1], 10) : null
}
