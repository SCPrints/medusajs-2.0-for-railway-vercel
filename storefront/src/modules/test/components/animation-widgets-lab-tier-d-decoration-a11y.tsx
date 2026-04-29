"use client"

import confetti from "canvas-confetti"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"

const BLOB_A =
  "M45,10 C75,0 95,25 90,50 C85,78 55,92 30,85 C5,78 -5,50 12,28 C20,15 32,12 45,10z"
const BLOB_B =
  "M50,8 C82,12 98,42 88,68 C78,95 48,98 22,88 C-5,78 -8,45 15,22 C28,8 38,6 50,8z"

export function LabTierDSvgBlobMorph({ reducedMotion }: { reducedMotion: boolean }) {
  const [flip, setFlip] = useState(false)

  return (
    <div className="flex flex-col items-start gap-3">
      <button type="button" className="text-xs underline" onClick={() => setFlip((f) => !f)}>
        Toggle shape
      </button>
      <svg width={160} height={120} viewBox="0 0 100 100" className="text-[#FF2E63]">
        <AnimatePresence mode="wait">
          <motion.path
            key={flip ? "b" : "a"}
            fill="currentColor"
            fillOpacity={0.35}
            stroke="currentColor"
            strokeWidth={1.5}
            d={flip ? BLOB_B : BLOB_A}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.92 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.35 }}
          />
        </AnimatePresence>
      </svg>
    </div>
  )
}

export function LabTierDConfettiShapes({ reducedMotion }: { reducedMotion: boolean }) {
  const fire = () => {
    if (reducedMotion) {
      return
    }
    confetti({
      particleCount: 38,
      spread: 65,
      startVelocity: 28,
      origin: { y: 0.65, x: 0.5 },
      shapes: ["star"],
      scalar: 0.9,
      colors: ["#FF2E63", "#6366f1", "#fbbf24"],
    })
  }

  return (
    <button type="button" className="rounded-lg border border-ui-border-base px-4 py-2 text-sm" onClick={fire}>
      Star burst (canvas-confetti)
    </button>
  )
}

export function LabTierDNoiseGradientBorder({ reducedMotion }: { reducedMotion: boolean }) {
  const spin = reducedMotion
    ? {}
    : {
        rotate: 360,
      }
  const counter = reducedMotion
    ? {}
    : {
        rotate: -360,
      }

  return (
    <motion.div
      className="relative rounded-xl p-[2px]"
      animate={spin}
      transition={reducedMotion ? { duration: 0 } : { duration: 8, repeat: Infinity, ease: "linear" }}
      style={{
        background:
          "conic-gradient(from 0deg, #FF2E63, #6366f1, #22c55e, #fbbf24, #FF2E63)",
      }}
    >
      <motion.div
        className="rounded-[10px] bg-ui-bg-base px-5 py-4 text-sm"
        animate={counter}
        transition={reducedMotion ? { duration: 0 } : { duration: 8, repeat: Infinity, ease: "linear" }}
      >
        CTA with spinning conic border (outer rotates, inner counter-rotates). Off when reduced motion is on.
      </motion.div>
    </motion.div>
  )
}

function SkeletonRow({ delay, reducedMotion }: { delay: number; reducedMotion: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ui-border-base p-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-ui-bg-subtle">
        <motion.div
          className="h-full w-full bg-gradient-to-r from-transparent via-white/50 to-transparent"
          animate={
            reducedMotion ? {} : { x: ["-100%", "100%"] }
          }
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "linear",
            delay,
          }}
        />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="h-2 overflow-hidden rounded bg-ui-bg-subtle">
          <motion.div
            className="h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={reducedMotion ? {} : { x: ["-100%", "100%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: delay + 0.05 }}
          />
        </div>
        <div className="h-2 w-2/3 overflow-hidden rounded bg-ui-bg-subtle">
          <motion.div
            className="h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={reducedMotion ? {} : { x: ["-100%", "100%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: delay + 0.1 }}
          />
        </div>
      </div>
    </div>
  )
}

export function LabTierDSkeletonListShimmer({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="max-w-md space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <SkeletonRow key={i} delay={i * 0.12} reducedMotion={reducedMotion} />
      ))}
    </div>
  )
}

export function LabTierDFocusRingMorph({ reducedMotion }: { reducedMotion: boolean }) {
  const [mode, setMode] = useState<"btn" | "input">("btn")

  return (
    <div className="space-y-3">
      <p className="text-xs text-ui-fg-muted">
        Tab between controls — ring eases between square-ish (button) and pill (input). {reducedMotion ? "Reduced motion: no transition." : ""}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setMode("btn")}
          className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2E63] ${
            reducedMotion ? "" : "transition-[border-radius] duration-300"
          } rounded-md px-4 py-2 ${mode === "btn" ? "border-2 border-ui-border-base" : "border border-transparent"}`}
        >
          Primary
        </button>
        <input
          type="text"
          aria-label="Demo input"
          onFocus={() => setMode("input")}
          placeholder="Email"
          className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2E63] ${
            reducedMotion ? "" : "transition-[border-radius] duration-300"
          } rounded-full border border-ui-border-base px-4 py-2 text-sm`}
        />
      </div>
    </div>
  )
}

export function LabTierDReducedMotionToggleDemo({ reducedMotion: systemRm }: { reducedMotion: boolean }) {
  const [local, setLocal] = useState(false)
  const reduce = systemRm || local

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />
        Force <code className="text-xs">data-motion=&quot;reduce&quot;</code> on wrapper (educational)
      </label>
      <div
        data-motion={reduce ? "reduce" : "default"}
        className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4 [&[data-motion=reduce]_div]:animate-none"
      >
        <motion.div
          className="h-12 w-12 rounded-lg bg-[#FF2E63]"
          animate={reduce ? { rotate: 0 } : { rotate: [0, 4, -4, 0] }}
          transition={reduce ? { duration: 0 } : { duration: 2, repeat: Infinity }}
        />
        <p className="mt-2 text-xs text-ui-fg-muted">
          With reduce, the wiggle stops; hook your CSS to{" "}
          <code className="text-[10px]">[data-motion=reduce]</code> or prefers-reduced-motion.
        </p>
      </div>
    </div>
  )
}

export function LabTierDWillChangeStress({ reducedMotion }: { reducedMotion: boolean }) {
  const [heavy, setHeavy] = useState(false)
  const [fps, setFps] = useState(0)
  const raf = useRef<number | null>(null)
  const last = useRef(performance.now())
  const frames = useRef(0)

  useEffect(() => {
    const tick = (now: number) => {
      frames.current += 1
      if (now - last.current >= 1000) {
        setFps(frames.current)
        frames.current = 0
        last.current = now
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current)
      }
    }
  }, [])

  return (
    <div className="max-w-md space-y-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={heavy} onChange={(e) => setHeavy(e.target.checked)} />
        Enable blurred layer + <code className="text-xs">will-change: transform</code>
      </label>
      <p className="text-xs text-ui-fg-muted">
        Lab counter ~{fps} fps. On low-end devices the combo can jank; use will-change sparingly and remove after
        animation. {reducedMotion ? "Heavy layer suppressed." : ""}
      </p>
      <div className="relative h-28 overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base">
        <div className="p-4">Content layer</div>
        {!reducedMotion && heavy ? (
          <div
            className="pointer-events-none absolute inset-0 backdrop-blur-md will-change-transform"
            style={{ transform: "translateZ(0)" }}
          />
        ) : null}
      </div>
    </div>
  )
}
