import { useEffect } from "react"

import { useGo } from "../../lib/nav"

/**
 * The Quotes list became the Jobs list (2026-10-27). Old links still work:
 * `?id=` / `?quote=` (emails, bookmarks) open that job's Quote section,
 * `?new=1` opens the New job drawer. No route config, so no sidebar entry.
 */
const QuotesRedirect = () => {
  const go = useGo()
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const id = p.get("id") ?? p.get("quote")
    if (id) go(`/app/jobs/${encodeURIComponent(id)}#quote`, { replace: true })
    else go(p.get("new") === "1" ? "/app/jobs?new=1" : "/app/jobs", { replace: true })
  }, [])
  return null
}

export default QuotesRedirect
