"use client"

import { useGSAP } from "@gsap/react"
import { motion } from "framer-motion"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useCallback, useEffect, useRef, useState } from "react"

gsap.registerPlugin(ScrollTrigger)

const STORY_CHAPTERS = [
  {
    id: "ink",
    title: "Ink & film",
    body: "DTF transfers use pigment ink on a carrier film — detail holds on dark garments.",
  },
  {
    id: "press",
    title: "Heat press",
    body: "Time, temperature, and pressure are tuned per blank so the print bonds cleanly.",
  },
  {
    id: "care",
    title: "Care label",
    body: "Cold wash inside out keeps vibrancy; avoid dry-clean on decorated panels.",
  },
]

export function LabGsapScrollTrigger({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (reducedMotion) {
        return
      }
      const root = rootRef.current
      const box = boxRef.current
      if (!root || !box) {
        return
      }

      const ctx = gsap.context(() => {
        gsap.fromTo(
          box,
          { x: 0, rotation: 0 },
          {
            x: 140,
            rotation: 180,
            ease: "none",
            scrollTrigger: {
              trigger: root,
              start: "top 80%",
              end: "bottom 20%",
              scrub: 1,
            },
          }
        )
      }, root)

      return () => ctx.revert()
    },
    { scope: rootRef, dependencies: [reducedMotion] }
  )

  if (reducedMotion) {
    return (
      <div className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle px-4 py-10 text-center">
        <p className="text-sm text-ui-fg-muted">
          GSAP ScrollTrigger scrub is disabled when <strong className="text-ui-fg-base">prefers-reduced-motion</strong>{" "}
          is set.
        </p>
        <div className="mx-auto h-14 w-14 rounded-lg bg-[#FF2E63] shadow-md" />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="space-y-6 rounded-xl border border-ui-border-base bg-ui-bg-subtle px-4 py-16">
      <p className="text-center text-sm text-ui-fg-muted">
        Scroll the <strong className="text-ui-fg-base">page</strong> while this block is on screen — the square scrubs
        with GSAP ScrollTrigger.
      </p>
      <div ref={boxRef} className="mx-auto h-14 w-14 rounded-lg bg-[#FF2E63] shadow-md" />
    </div>
  )
}

export function LabScratchOffCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painting = useRef(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const setup = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || reducedMotion) {
      return
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = "source-over"

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h)
      ctx.fillStyle = "rgba(240,240,240,0.97)"
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = "#888"
      ctx.font = "14px system-ui"
      ctx.textAlign = "center"
      ctx.fillText("Scratch to reveal", w / 2, h / 2)
      setImgLoaded(true)
    }
    img.src = "https://picsum.photos/seed/scratchofflab/640/360"
  }, [reducedMotion])

  useEffect(() => {
    if (reducedMotion) {
      setImgLoaded(true)
      return
    }
    setup()
    const ro = new ResizeObserver(() => setup())
    if (wrapRef.current) {
      ro.observe(wrapRef.current)
    }
    return () => ro.disconnect()
  }, [setup, reducedMotion])

  const paint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion) {
      return
    }
    const r = canvas.getBoundingClientRect()
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    const x = clientX - r.left
    const y = clientY - r.top
    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(x, y, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = "source-over"
  }

  if (reducedMotion) {
    return (
      <div className="overflow-hidden rounded-xl border border-ui-border-base">
        <img
          src="https://picsum.photos/seed/scratchofflab/640/360"
          alt=""
          className="h-48 w-full object-cover"
        />
        <p className="p-3 text-xs text-ui-fg-muted">Reduced motion: image shown without scratch layer.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative h-48 w-full overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle touch-none"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onPointerDown={(e) => {
            painting.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            paint(e.clientX, e.clientY)
          }}
          onPointerMove={(e) => {
            if (painting.current) {
              paint(e.clientX, e.clientY)
            }
          }}
          onPointerUp={(e) => {
            painting.current = false
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => {
            painting.current = false
          }}
        />
        {!imgLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-ui-fg-muted">Loading…</div>
        ) : null}
      </div>
      <button
        type="button"
        className="text-xs font-medium text-ui-fg-muted underline"
        onClick={() => setup()}
      >
        Reset scratch layer
      </button>
    </div>
  )
}

export function LabTossCard({ reducedMotion }: { reducedMotion: boolean }) {
  const [resetKey, setResetKey] = useState(0)
  const [toss, setToss] = useState<"left" | "right" | null>(null)

  useEffect(() => {
    setToss(null)
  }, [resetKey])

  return (
    <div className="space-y-4">
      <div className="relative flex min-h-[140px] items-center justify-center overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle py-6">
        <motion.div
          key={resetKey}
          drag={!reducedMotion && !toss}
          dragConstraints={false}
          dragElastic={0.08}
          dragMomentum
          animate={
            toss === "left"
              ? { x: -420, opacity: 0, rotate: -18 }
              : toss === "right"
                ? { x: 420, opacity: 0, rotate: 18 }
                : { x: 0, opacity: 1, rotate: 0 }
          }
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          onDragEnd={(_, info) => {
            if (reducedMotion || toss) {
              return
            }
            if (info.velocity.x < -420 || info.offset.x < -72) {
              setToss("left")
            } else if (info.velocity.x > 420 || info.offset.x > 72) {
              setToss("right")
            }
          }}
          className="w-52 cursor-grab rounded-xl border border-ui-border-base bg-ui-bg-base p-5 text-center text-sm font-medium text-ui-fg-base shadow-sm active:cursor-grabbing"
        >
          Fling sideways — high velocity or long drag releases the card.
        </motion.div>
      </div>
      <button
        type="button"
        className="text-xs font-medium text-ui-fg-muted underline"
        onClick={() => setResetKey((k) => k + 1)}
      >
        Reset card
      </button>
    </div>
  )
}

export function LabStickyStoryNav() {
  const [active, setActive] = useState(0)
  const scrollRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root) {
      return undefined
    }
    const nodes = root.querySelectorAll<HTMLElement>("[data-lab-chapter]")
    if (nodes.length === 0) {
      return undefined
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) {
            return
          }
          const idx = Number(en.target.getAttribute("data-lab-chapter"))
          if (!Number.isNaN(idx)) {
            setActive(idx)
          }
        })
      },
      { root, rootMargin: "-38% 0px -38% 0px", threshold: 0.01 }
    )
    nodes.forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])

  return (
    <div className="max-w-md rounded-xl border border-ui-border-base">
      <div className="sticky top-0 z-[5] border-b border-ui-border-base bg-ui-bg-base/95 px-4 py-2 text-sm font-semibold text-ui-fg-base backdrop-blur-sm">
        {STORY_CHAPTERS[active]?.title ?? "—"}
      </div>
      <div ref={scrollRootRef} className="max-h-[260px] overflow-y-auto">
        {STORY_CHAPTERS.map((c, i) => (
          <div
            key={c.id}
            data-lab-chapter={i}
            className="min-h-[120px] border-b border-ui-border-base p-4 last:border-b-0"
          >
            <p className="text-xs text-ui-fg-muted">{c.body}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-ui-border-base p-3 text-xs text-ui-fg-muted">
        Scroll inside the panel — sticky title tracks the centered chapter.
      </p>
    </div>
  )
}

export function LabViewTransitionDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const [mode, setMode] = useState<"a" | "b">("a")

  const toggle = () => {
    const next = mode === "a" ? "b" : "a"
    if (
      !reducedMotion &&
      typeof document !== "undefined" &&
      typeof (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition ===
        "function"
    ) {
      ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() =>
        setMode(next)
      )
    } else {
      setMode(next)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-sm font-medium text-ui-fg-base"
      >
        Toggle panel (View Transition API)
      </button>
      <div
        className={
          mode === "a"
            ? "flex h-24 items-center justify-center rounded-xl bg-indigo-500/15 text-sm font-medium text-ui-fg-base"
            : "flex h-24 items-center justify-center rounded-xl bg-[#FF2E63]/15 text-sm font-medium text-ui-fg-base"
        }
      >
        {mode === "a" ? "Panel A — indigo wash" : "Panel B — brand wash"}
      </div>
      <p className="text-xs text-ui-fg-muted">
        Uses <code className="text-ui-fg-base">document.startViewTransition</code> when available (e.g. Chromium).
        Falls back to an instant swap.
      </p>
    </div>
  )
}

export function LabStartingStyleDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-3">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .lab-start-card {
              opacity: 1;
              transform: translateY(0);
              transition: opacity 0.4s ease, transform 0.4s ease;
            }
            @starting-style {
              .lab-start-card {
                opacity: 0;
                transform: translateY(10px);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .lab-start-card {
                transition: none;
              }
            }
          `,
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-sm font-medium text-ui-fg-base"
      >
        {show ? "Remove card" : "Mount card (@starting-style)"}
      </button>
      {show ? (
        <div className="lab-start-card rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4 text-sm text-ui-fg-base">
          This block uses CSS <code className="text-xs">@starting-style</code> for the first paint when it appears.
          {reducedMotion ? " Reduced motion removes the transition." : ""}
        </div>
      ) : null}
      <p className="text-xs text-ui-fg-muted">Supported in recent Chrome / Safari; harmless elsewhere.</p>
    </div>
  )
}
