/**
 * Initial tab for a tabbed admin hub, read from `?tab=` so links can deep-link
 * into a tab (e.g. `/app/production?tab=rejects`). Falls back when the param
 * is missing or not one of the hub's tabs.
 */
export function initialHubTab<T extends string>(tabs: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback
  const tab = new URLSearchParams(window.location.search).get("tab")
  return tabs.includes(tab as T) ? (tab as T) : fallback
}
