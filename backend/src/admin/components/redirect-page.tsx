import { useEffect } from "react"

/**
 * Builds a sidebar-less admin page that forwards an old route to its new
 * home, keeping the query string. Stubs that use it must NOT export a
 * `defineRouteConfig` — that is what keeps them out of the sidebar.
 */
export function makeRedirectPage(to: string) {
  const RedirectPage = () => {
    useEffect(() => {
      const search = window.location.search.replace(/^\?/, "")
      // targets like "/app/enquiries?tab=contact" already carry a query
      const joined = search ? `${to}${to.includes("?") ? "&" : "?"}${search}` : to
      window.location.replace(joined)
    }, [])
    return null
  }
  return RedirectPage
}
