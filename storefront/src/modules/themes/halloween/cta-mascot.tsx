"use client"

import { InkDefs, Pumpkin } from "./art"
import s from "./halloween.module.css"
import { usePageHidden } from "./use-page-hidden"

/** Pumpkin leaning against the hero's "Shop the range" button. */
export default function HalloweenCtaMascot() {
  const hidden = usePageHidden()
  return (
    <>
      <InkDefs />
      <Pumpkin
        aria-hidden
        focusable="false"
        className={`${s.pumpkin} ${s.cta}${hidden ? ` ${s.paused}` : ""}`}
        data-testid="halloween-cta-pumpkin"
      />
    </>
  )
}
