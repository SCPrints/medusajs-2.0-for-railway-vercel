import { useEffect, useState } from "react"

/**
 * Shared fetch-into-state for report charts.
 *
 * Replaces the copy-pasted `useState×3 + let cancelled` effect that every
 * chart under components/reports carried. Semantics are identical to the
 * originals: previous data is kept while a reload is in flight, non-2xx
 * responses become `error` ("HTTP <status>"), and unmount/param changes
 * cancel state writes from stale requests.
 *
 * Query values that are null/undefined/"" are omitted from the query string
 * (matching the old `if (regionId) params.set(...)` guards).
 */
export function useReportData<T>(
  path: string,
  query?: Record<string, string | number | null | undefined>
): {
  data: T | null
  loading: boolean
  error: string | null
  loadedAt: number | null
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)

  // Serialize so callers can pass inline object literals without re-fetching
  // every render.
  const queryKey = JSON.stringify(query ?? {})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    const entries = JSON.parse(queryKey) as Record<
      string,
      string | number | null | undefined
    >
    for (const [k, v] of Object.entries(entries)) {
      if (v !== null && v !== undefined && v !== "") params.set(k, String(v))
    }
    const qs = params.toString()
    fetch(qs ? `${path}?${qs}` : path, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (!cancelled) {
          setData(j as T)
          setLoadedAt(Date.now())
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path, queryKey])

  return { data, loading, error, loadedAt }
}
