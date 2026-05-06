"use client"

import React from "react"
import type { ArchMode } from "../lib/types"

const FONT_FAMILY: Record<string, string> = {
  block: "'Arial Black', system-ui, sans-serif",
  serif: "'Playfair Display', Georgia, serif",
  script: "'Brush Script MT', cursive",
  bold: "'Helvetica Neue', system-ui, sans-serif",
  condensed: "'Arial Narrow', sans-serif",
}

type Props = {
  text: string
  font: string
  archMode: ArchMode
  heightMm: number
}

const WIDTH = 600
const HEIGHT = 220

const LetteringCanvas: React.FC<Props> = ({ text, font, archMode, heightMm }) => {
  const fontFamily = FONT_FAMILY[font] ?? FONT_FAMILY.block
  // Scale: ~3.5px per mm gives a generous preview
  const fontSize = Math.max(16, Math.min(120, heightMm * 3.5))

  if (!text.trim()) {
    return (
      <div
        className="flex items-center justify-center w-full rounded-md border border-dashed border-ui-border-base text-ui-fg-muted"
        style={{ height: HEIGHT }}
      >
        Type to preview
      </div>
    )
  }

  const radius = 200
  const cx = WIDTH / 2
  const arcUpPath = `M ${cx - radius},${HEIGHT - 30} A ${radius},${radius} 0 0 1 ${cx + radius},${HEIGHT - 30}`
  const arcDownPath = `M ${cx - radius},30 A ${radius},${radius} 0 0 0 ${cx + radius},30`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full rounded-md border border-ui-border-base bg-ui-bg-base"
      style={{ height: HEIGHT }}
    >
      <defs>
        <path id="emb-arc-up" d={arcUpPath} fill="none" />
        <path id="emb-arc-down" d={arcDownPath} fill="none" />
      </defs>
      {archMode === "straight" ? (
        <text
          x="50%"
          y="55%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={fontFamily}
          fontSize={fontSize}
          fill="var(--brand-primary, #002a5c)"
        >
          {text}
        </text>
      ) : (
        <text
          fontFamily={fontFamily}
          fontSize={fontSize}
          fill="var(--brand-primary, #002a5c)"
          textAnchor="middle"
        >
          <textPath
            href={archMode === "arch_up" ? "#emb-arc-up" : "#emb-arc-down"}
            startOffset="50%"
          >
            {text}
          </textPath>
        </text>
      )}
    </svg>
  )
}

export default LetteringCanvas
