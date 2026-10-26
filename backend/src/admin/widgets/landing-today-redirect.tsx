import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { useGo } from "../lib/nav"

/**
 * Medusa lands every login on /app/orders and offers no setting to change
 * it. Once per browser tab, the first visit to the bare orders list goes to
 * /app/today instead — so staff start the day on the job list. Clicking
 * Orders afterwards works as normal. Renders nothing.
 */
const KEY = "scp:landed-today"

const LandingTodayRedirect = () => {
  const go = useGo()
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return
      sessionStorage.setItem(KEY, "1")
      if (window.location.pathname.replace(/\/$/, "") === "/app/orders" && !window.location.search) {
        go("/app/today", { replace: true })
      }
    } catch {
      /* private mode: just stay on orders */
    }
  }, [])
  return null
}

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default LandingTodayRedirect
