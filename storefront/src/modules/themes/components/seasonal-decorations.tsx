"use client"

import dynamic from "next/dynamic"

import { useActiveTheme, useIdle } from "@lib/themes/client"
import type { MascotName } from "@modules/themes/halloween/mascot"

// Each theme's decorations are a separate chunk, fetched only when that theme
// is active and the browser is idle. Classic visitors download none of it.
// All three come from one module so the artwork is bundled once, not per import.
const HalloweenSiteDecor = dynamic(
  () => import("@modules/themes/halloween/decor").then((m) => m.HalloweenSiteDecor),
  { ssr: false }
)
const HalloweenHeroArt = dynamic(
  () => import("@modules/themes/halloween/decor").then((m) => m.HalloweenHeroArt),
  { ssr: false }
)
const HalloweenCtaMascot = dynamic(
  () => import("@modules/themes/halloween/decor").then((m) => m.HalloweenCtaMascot),
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

// The extended cast is its own chunk, fetched only on pages that place one.
const HalloweenMascot = dynamic(
  () => import("@modules/themes/halloween/mascot").then((m) => m.HalloweenMascot),
  { ssr: false }
)

/**
 * Theme-gated drop-in mascot: renders nothing for classic visitors (and
 * downloads nothing), a `<HalloweenMascot>` from the registry otherwise.
 * `name` is a Halloween mascot key; other themes can add their own branch.
 */
export function SeasonalMascot({
  name,
  ...rest
}: { name: MascotName; size?: number; animate?: boolean; className?: string }) {
  const theme = useActiveTheme()
  const idle = useIdle()
  if (!idle) return null
  if (theme === "halloween") return <HalloweenMascot name={name} {...rest} />
  return null
}

/** Mascot leaning on the hero CTA. Must sit inside a `relative` wrapper around the button. */
export function SeasonalCtaMascot() {
  const theme = useActiveTheme()
  const idle = useIdle()
  if (!idle) return null
  if (theme === "halloween") return <HalloweenCtaMascot />
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
