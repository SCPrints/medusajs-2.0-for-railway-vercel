/**
 * Quote expiry — pure selection logic.
 *
 * A quote is eligible for expiry when:
 *   - status === "quoted"  (only quotes that have been actively sent
 *     can expire — `new` quotes stay open indefinitely until staff act
 *     on them; `accepted` / `lost` / `expired` are terminal)
 *   - expires_at is set AND in the past
 *
 * Kept as a pure function so the daily cron and the unit tests can
 * share it.
 */

export type ExpiryCandidate = {
  id: string
  status: string
  expires_at: Date | string | null
}

/**
 * True when `expires_at` is set, parseable and strictly in the past. Unset or
 * malformed = never expires. Shared by the cron selection below and the
 * customer accept route, which must not depend on the (off by default) cron
 * having flipped the status.
 */
export function isQuoteExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return false
  const ts = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt))
  return Number.isFinite(ts) && ts < now.getTime()
}

export function selectExpiredQuotes(
  rows: ExpiryCandidate[],
  now: Date = new Date()
): string[] {
  const ids: string[] = []
  for (const row of rows) {
    if (!row?.id) continue
    if (row.status !== "quoted") continue
    if (!isQuoteExpired(row.expires_at, now)) continue
    ids.push(row.id)
  }
  return ids
}
