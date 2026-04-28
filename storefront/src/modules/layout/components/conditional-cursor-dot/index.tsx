"use client"

import { usePathname } from "next/navigation"

import CursorDot from "@modules/layout/components/cursor-dot"

/**
 * Hides the global cursor trail on internal animation lab routes so alternate
 * cursor experiments are visible without stacking two systems.
 */
export default function ConditionalCursorDot() {
  const pathname = usePathname()
  if (pathname?.includes("/test/animation-widgets")) {
    return null
  }
  return <CursorDot />
}
