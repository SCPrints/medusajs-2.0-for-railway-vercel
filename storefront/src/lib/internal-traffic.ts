/**
 * Staff browsers carry a `scp_internal=1` cookie, set by the admin
 * (backend/src/admin/widgets/mark-internal-traffic.tsx) on `.scprints.com.au`.
 * Analytics stays off in those browsers so our own visits don't count.
 *
 * Read on the client only: reading it on the server would turn cached pages
 * into per-request ones.
 */

/** JS expression for the inline analytics snippets. */
export const IS_INTERNAL_TRAFFIC_JS =
  "document.cookie.split('; ').indexOf('scp_internal=1')>-1"

export const isInternalTraffic = () =>
  typeof document !== "undefined" &&
  document.cookie.split("; ").includes("scp_internal=1")
