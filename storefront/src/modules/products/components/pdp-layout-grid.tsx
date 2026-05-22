"use client"

import { ReactNode } from "react"
import { motion } from "framer-motion"

type Props = {
  customizerSlot: ReactNode
}

/**
 * Full-width 12-column grid for the embedded customizer. The customizer
 * renders its own gallery + wizard sidebar inside this grid (the
 * customizer wraps its children in `display: contents` so they become
 * direct grid children).
 *
 * Earlier versions of this file also rendered an aside column with the
 * product description + spec tabs. Those moved to a full-width header
 * above the customizer and a 2-up details section below it (see
 * products/templates/index.tsx), so the customizer always gets the full
 * content width.
 */
export default function PdpLayoutGrid({ customizerSlot }: Props) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
      id="product-customizer"
      className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start"
    >
      {customizerSlot}
    </motion.div>
  )
}
