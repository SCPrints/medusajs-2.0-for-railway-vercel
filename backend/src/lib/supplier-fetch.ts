/** Per-request ceiling for every supplier API call (review 2-7). */
export const SUPPLIER_FETCH_TIMEOUT_MS = 20_000

/** `AbortSignal.timeout` rejects with TimeoutError; a manual abort with AbortError. */
export const isFetchTimeout = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name
  return name === "TimeoutError" || name === "AbortError"
}
