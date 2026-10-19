"use client"

import { Cobweb, InkDefs } from "./art"
import s from "./halloween.module.css"
import { usePageHidden } from "./use-page-hidden"

/** Swaying cobweb in the header's top-right corner: pink spider + a tangled bat. */
export default function HalloweenSiteDecor() {
  const hidden = usePageHidden()
  return (
    <>
      <InkDefs />
      <Cobweb
        aria-hidden
        focusable="false"
        className={`${s.web}${hidden ? ` ${s.paused}` : ""}`}
        data-testid="halloween-cobweb"
      />
    </>
  )
}
