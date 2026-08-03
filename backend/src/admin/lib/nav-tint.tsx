import type { ComponentType, CSSProperties } from "react"

// Sidebar group colours. Ranks live in each route's defineRouteConfig:
// 0 tasks · 5 reports · 10s sales · 20s production · 30s catalog ·
// 40s storefront · 50s crm · 90 help (untinted)
export const NAV_COLOR = {
  tasks: "#f59e0b",
  reports: "#06b6d4",
  sales: "#10b981",
  production: "#f97316",
  catalog: "#3b82f6",
  storefront: "#a855f7",
  crm: "#ec4899",
} as const

export const tinted = (
  Icon: ComponentType<{ style?: CSSProperties }>,
  color: string
) => {
  return function TintedNavIcon() {
    return <Icon style={{ color }} />
  }
}
