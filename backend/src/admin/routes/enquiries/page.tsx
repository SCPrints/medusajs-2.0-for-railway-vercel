import { useEffect } from "react"

import { useGo } from "../../lib/nav"

/**
 * Enquiries went away (2026-10-27): contact-form enquiries are jobs from the
 * moment they land (Jobs → New), and open carts have their own page under
 * Customers. Old links keep working. No route config, so no sidebar entry.
 */
const EnquiriesRedirect = () => {
  const go = useGo()
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("tab") === "carts") {
      const q = p.get("q")
      go(q ? `/app/open-carts?q=${encodeURIComponent(q)}` : "/app/open-carts", { replace: true })
    } else go("/app/jobs?folder=new", { replace: true })
  }, [])
  return null
}

export default EnquiriesRedirect
