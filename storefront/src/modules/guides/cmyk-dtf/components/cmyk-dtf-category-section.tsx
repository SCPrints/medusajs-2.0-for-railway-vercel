"use client"

import { motion, useReducedMotion } from "framer-motion"

import type { CmykDtfCategory } from "../cmyk-dtf-chart-schema"

import CmykDtfColorCard from "./cmyk-dtf-color-card"

type CmykDtfCategorySectionProps = {
  section: CmykDtfCategory
  /** Running count of cards before this section — used for stagger */
  cardOffset: number
}

export default function CmykDtfCategorySection({
  section,
  cardOffset,
}: CmykDtfCategorySectionProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.section
      className="scroll-mt-24"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.45,
        ease: "easeOut",
      }}
    >
      <h2 className="text-xl font-bold tracking-tight text-ui-fg-base small:text-2xl">
        {section.category}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-fg-subtle small:text-base">
        {section.description}
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {section.colors.map((color, index) => {
          const globalIndex = cardOffset + index
          const stagger = prefersReducedMotion ? 0 : globalIndex * 0.06

          return (
            <CmykDtfColorCard
              key={`${section.category}-${color.name}`}
              color={color}
              entranceDelay={stagger}
              barDelayBase={prefersReducedMotion ? 0 : 0.15}
            />
          )
        })}
      </div>
    </motion.section>
  )
}
