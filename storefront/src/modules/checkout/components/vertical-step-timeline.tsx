"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useId } from "react"
import { useInView } from "react-intersection-observer"

import type { VerticalTimelineStep } from "@lib/util/checkout-progress"

type Props = {
  steps: VerticalTimelineStep[]
  /** Accessible name for the step list (e.g. "Checkout steps") */
  listAriaLabel: string
  title?: string
  caption?: string
}

export default function VerticalStepTimeline({
  steps,
  listAriaLabel,
  title,
  caption,
}: Props) {
  const reducedMotionPref = useReducedMotion()
  const reducedMotion = reducedMotionPref ?? false
  const captionId = useId()
  const { ref, inView } = useInView({ threshold: 0.25, triggerOnce: true })

  return (
    <div ref={ref} className="space-y-3">
      {title ? (
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-secondary)]">
          {title}
        </p>
      ) : null}
      {caption ? (
        <p id={captionId} className="text-xs text-ui-fg-subtle">
          {caption}
        </p>
      ) : null}
      <ol
        aria-describedby={caption ? captionId : undefined}
        aria-label={listAriaLabel}
        className="m-0 max-w-sm list-none space-y-0 p-0"
      >
        {steps.map((s, i) => {
          const segmentFilled = s.state === "complete"
          const showCheck = s.state === "complete"
          const stepNumber = i + 1
          const isCurrent = s.state === "current"

          return (
            <li
              key={s.id}
              className="flex gap-3"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex flex-col items-center">
                <motion.div
                  className={
                    showCheck
                      ? "flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-accent)] text-xs font-bold text-white"
                      : isCurrent
                        ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--brand-accent)] bg-ui-bg-base text-xs font-bold text-[var(--brand-primary)]"
                        : "flex h-8 w-8 items-center justify-center rounded-full border border-ui-border-base bg-ui-bg-base text-xs font-bold text-ui-fg-muted"
                  }
                  initial={false}
                  animate={{
                    scale:
                      inView && showCheck && !reducedMotion
                        ? [1, 1.12, 1]
                        : 1,
                  }}
                  transition={{
                    delay: i * 0.1,
                    duration: 0.35,
                  }}
                >
                  {showCheck ? "✓" : stepNumber}
                </motion.div>
                {i < steps.length - 1 ? (
                  <div className="relative min-h-[28px] w-0.5 flex-1 bg-ui-border-base">
                    <motion.div
                      className="absolute inset-x-0 top-0 h-full origin-top bg-[var(--brand-accent)]"
                      initial={{ scaleY: 0 }}
                      animate={{
                        scaleY:
                          inView && segmentFilled
                            ? 1
                            : reducedMotion && segmentFilled
                              ? 1
                              : 0,
                      }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { duration: 0.55, delay: 0.12 + i * 0.08 }
                      }
                    />
                  </div>
                ) : null}
              </div>
              <div className="pb-4 pt-1">
                <p
                  className={
                    isCurrent
                      ? "text-sm font-semibold text-[var(--brand-primary)]"
                      : "text-sm font-medium text-ui-fg-base"
                  }
                >
                  {s.label}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
