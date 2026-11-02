import { defineWidgetConfig } from "@medusajs/admin-sdk"

// Marks this browser as staff so the storefront's analytics skips it (see
// storefront/src/lib/internal-traffic.ts). Runs at module load, not in a
// component: widgets don't mount on custom routes like /app/jobs, but every
// widget module is imported when the admin bundle loads.
// ponytail: also marks anyone who only opens the login page; customers don't go there.
if (
  typeof window !== "undefined" &&
  window.location.hostname.endsWith("scprints.com.au")
) {
  document.cookie =
    "scp_internal=1; domain=.scprints.com.au; path=/; max-age=31536000; samesite=lax; secure"
}

const MarkInternalTraffic = () => null

export const config = defineWidgetConfig({
  zone: "login.after",
})

export default MarkInternalTraffic
