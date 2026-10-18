"use client"

import dynamic from "next/dynamic"

import { useActiveTheme, useIdle } from "@lib/themes/client"

// Each theme's decorations are a separate chunk, fetched only when that theme
// is active and the browser is idle. Classic visitors download none of it.
const HalloweenSiteDecor = dynamic(
  () => import("@modules/themes/halloween/site-decor"),
  { ssr: false }
)
const HalloweenHeroArt = dynamic(
  () => import("@modules/themes/halloween/hero-art"),
  { ssr: false }
)

/** Header-corner decoration. Rendered inside the shop header only — never checkout. */
export function SeasonalHeaderDecor() {
  const theme = useActiveTheme()
  const idle = useIdle()
  if (!idle) return null
  if (theme === "halloween") return <HalloweenSiteDecor />
  return null
}

/** Home hero overlay. Must sit inside a `relative overflow-hidden` parent. */
export function SeasonalHeroArt() {
  const theme = useActiveTheme()
  const idle = useIdle()
  if (!idle) return null
  if (theme === "halloween") return <HalloweenHeroArt />
  return null
}
