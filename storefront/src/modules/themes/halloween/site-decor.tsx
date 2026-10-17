"use client"

import { Cobweb } from "./art"
import s from "./halloween.module.css"
import { usePageHidden } from "./use-page-hidden"

/** Faint swaying cobweb in the header's top-right corner. */
export default function HalloweenSiteDecor() {
  const hidden = usePageHidden()
  return (
    <Cobweb
      aria-hidden
      focusable="false"
      className={`${s.web}${hidden ? ` ${s.paused}` : ""}`}
      data-testid="halloween-cobweb"
    />
  )
}
