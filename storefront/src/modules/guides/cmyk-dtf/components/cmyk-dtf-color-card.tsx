"use client"

import { motion, useReducedMotion } from "framer-motion"

import type { CmykDtfColor } from "../cmyk-dtf-chart-schema"

const INK_ROWS: {
  field: keyof Pick<CmykDtfColor, "c" | "m" | "y" | "k">
  label: string
  barClass: string
}[] = [
  { field: "c", label: "C", barClass: "bg-cyan-500" },
  { field: "m", label: "M", barClass: "bg-fuchsia-600" },
  { field: "y", label: "Y", barClass: "bg-amber-400" },
  { field: "k", label: "K", barClass: "bg-neutral-800 dark:bg-neutral-200" },
]

type CmykDtfColorCardProps = {
  color: CmykDtfColor
  /** Stagger card entrance */
  entranceDelay: number
  /** Base delay for ink bars (after entrance) */
  barDelayBase: number
}

export default function CmykDtfColorCard({
  color,
  entranceDelay,
  barDelayBase,
}: CmykDtfColorCardProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.article
      className="flex flex-col overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm"
      initial={
        prefersReducedMotion ? false : { opacity: 0, y: 14 }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-48px" }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.4,
        delay: prefersReducedMotion ? 0 : entranceDelay,
        ease: "easeOut",
      }}
    >
      <div
        className="min-h-[100px] w-full shrink-0 border-b border-ui-border-base small:min-h-[120px]"
        style={{ backgroundColor: color.hex }}
        aria-hidden
      />
      <div className="flex flex-1 flex-col gap-4 p-4 small:p-5">
        <div>
          <h3 className="text-base font-semibold text-ui-fg-base">{color.name}</h3>
          <p className="mt-1 font-mono text-xs text-ui-fg-muted">
            C{color.c} M{color.m} Y{color.y} K{color.k}
          </p>
          {color.notes ? (
            <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">{color.notes}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ui-fg-muted">
            Ink levels
          </p>
          {INK_ROWS.map((row, rowIndex) => {
            const pct = color[row.field]
            const delay =
              (prefersReducedMotion ? 0 : barDelayBase + rowIndex * 0.06) +
              (prefersReducedMotion ? 0 : entranceDelay)

            return (
              <div key={row.field} className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-ui-fg-muted">
                  {row.label}
                </span>
                <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ui-bg-subtle">
                  <motion.div
                    className={`h-full rounded-full ${row.barClass}`}
                    initial={
                      prefersReducedMotion
                        ? { width: `${pct}%` }
                        : { width: "0%" }
                    }
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true, margin: "-20px" }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.55,
                      delay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ui-fg-muted">
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.article>
  )
}
