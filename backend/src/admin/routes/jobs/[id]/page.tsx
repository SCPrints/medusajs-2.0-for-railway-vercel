import { useEffect } from "react"
import { useParams } from "react-router-dom"

import { useGo } from "../../../lib/nav"

/**
 * /app/jobs/:id — kept for links (emails, cmd-K, the order page's Open job
 * bar, copied job links). Since 2026-10-27 the job opens beside the Jobs list
 * at /app/jobs?job=<id>; this forwards there, keeping #quote.
 */
const JobRedirect = () => {
  const go = useGo()
  const id = useParams().id ?? ""
  useEffect(() => {
    go(`/app/jobs?job=${encodeURIComponent(decodeURIComponent(id))}${window.location.hash}`, { replace: true })
  }, [id])
  return null
}

export default JobRedirect
