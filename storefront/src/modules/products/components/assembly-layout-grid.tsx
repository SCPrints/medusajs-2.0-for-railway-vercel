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
 *
 * Sizing is delegated to the parent: this fills 100% of its container's
 * height. The full-screen studio overlay (StudioLauncher) gives it a
 * `flex-1 min-h-0` parent so it fills the viewport below the studio top bar,
 * with the only scroll living inside the right-hand section panel.
 */
export default function AssemblyLayoutGrid({ customizerSlot }: Props) {
  return (
    <div
      id="product-customizer"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-ui-bg-base small:flex-row"
    >
      {customizerSlot}
    </div>
  )
}
