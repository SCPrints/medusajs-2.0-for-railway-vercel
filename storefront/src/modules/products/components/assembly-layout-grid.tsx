"use client"

import { ReactNode } from "react"

type Props = {
  customizerSlot: ReactNode
}

/**
 * Assembly-Studio-style full-height shell for the `/customizer-v2` test page.
 *
 * Unlike {@link PdpLayoutGrid} (a 12-column grid where the canvas and wizard
 * share width), this lays the customizer out as a single full-viewport-height
 * flex row: the garment canvas fills the left (flex-1) and the configuration
 * menu sits in a fixed-width panel on the right. The customizer template wraps
 * its two columns in `display:contents`, so they become direct flex children
 * here and the `assemblyLayout` styling on each column takes effect.
 *
 * Mirrors the look/feel of https://studio.rovoassembly.com while keeping all
 * existing SC Prints customizer functionality untouched.
 */
export default function AssemblyLayoutGrid({ customizerSlot }: Props) {
  return (
    <div
      id="product-customizer"
      className="flex h-[calc(100dvh-72px)] min-h-[560px] w-full flex-col overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-sm small:flex-row"
    >
      {customizerSlot}
    </div>
  )
}
