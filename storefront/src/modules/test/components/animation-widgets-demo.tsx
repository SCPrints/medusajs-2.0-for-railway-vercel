"use client"

import confetti from "canvas-confetti"
import { AnimatePresence, motion } from "framer-motion"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const LordiconBlock = dynamic(() => import("./animation-widgets-lordicon-block"), {
  ssr: false,
  loading: () => (
    <div className="flex gap-4">
      {[1, 2, 3].map((k) => (
        <div key={k} className="h-20 w-20 animate-pulse rounded-lg bg-ui-bg-base" />
      ))}
    </div>
  ),
})

const LottieBlock = dynamic(() => import("./animation-widgets-lottie-block"), {
  ssr: false,
  loading: () => <div className="mx-auto h-[200px] max-w-xs animate-pulse rounded-2xl bg-ui-bg-base" />,
})

const ParticlesBlock = dynamic(() => import("./animation-widgets-particles-block"), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] w-full animate-pulse rounded-xl bg-ui-bg-subtle" />
  ),
})

const Snowfall = dynamic(() => import("react-snowfall"), {
  ssr: false,
  loading: () => null,
})

/** Demo countdown target (Australia/Sydney-friendly fixed instant). */
const DEMO_COUNTDOWN_END = new Date("2026-12-31T12:00:00.000Z").getTime()

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="content-container border-b border-ui-border-base py-12">
      <h2 className="text-xl font-semibold text-ui-fg-base">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm text-ui-fg-muted">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

function CountdownDisplay() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const { days, hours, minutes, seconds, ended } = useMemo(() => {
    const diff = Math.max(0, DEMO_COUNTDOWN_END - now)
    if (diff === 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: now >= DEMO_COUNTDOWN_END }
    }
    const s = Math.floor(diff / 1000)
    return {
      days: Math.floor(s / 86400),
      hours: Math.floor((s % 86400) / 3600),
      minutes: Math.floor((s % 3600) / 60),
      seconds: s % 60,
      ended: false,
    }
  }, [now])

  const box = "rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-center min-w-[4.5rem]"
  if (ended) {
    return <p className="text-sm font-medium text-ui-fg-base">Demo target date reached — set a new one in code.</p>
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div className={box}>
        <div className="text-2xl font-bold tabular-nums text-ui-fg-base">{days}</div>
        <div className="text-xs text-ui-fg-muted">days</div>
      </div>
      <div className={box}>
        <div className="text-2xl font-bold tabular-nums text-ui-fg-base">{hours}</div>
        <div className="text-xs text-ui-fg-muted">hours</div>
      </div>
      <div className={box}>
        <div className="text-2xl font-bold tabular-nums text-ui-fg-base">{minutes}</div>
        <div className="text-xs text-ui-fg-muted">min</div>
      </div>
      <div className={box}>
        <div className="text-2xl font-bold tabular-nums text-ui-fg-base">{seconds}</div>
        <div className="text-xs text-ui-fg-muted">sec</div>
      </div>
    </div>
  )
}

function BeforeAfterSlider() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pct, setPct] = useState(50)
  const dragging = useRef(false)

  const onPointerMove = useCallback((clientX: number) => {
    const el = wrapRef.current
    if (!el) {
      return
    }
    const r = el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - r.left, 0), r.width)
    setPct(Math.round((x / r.width) * 100))
  }, [])

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto aspect-[5/3] w-full max-w-lg select-none overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle touch-none"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onPointerMove(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) {
          onPointerMove(e.clientX)
        }
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      {/* After (full background) */}
      <img
        src="https://picsum.photos/seed/afterwidget/800/480"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      {/* Before (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <img
          src="https://picsum.photos/seed/beforewidget/800/480"
          alt=""
          className="absolute inset-0 h-full w-full object-cover grayscale"
          draggable={false}
        />
      </div>
      <div
        className="absolute bottom-0 top-0 w-1 -translate-x-1/2 bg-white shadow-md"
        style={{ left: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-ui-fg-base text-xs font-bold text-ui-bg-base shadow-lg"
        style={{ left: `${pct}%` }}
      >
        ↔
      </div>
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
        Before
      </p>
      <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
        After
      </p>
    </div>
  )
}

function LoaderOverlayDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-sm font-medium text-ui-fg-base hover:bg-ui-bg-subtle"
        onClick={() => setOpen(true)}
      >
        Show loading overlay
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-ui-fg-base/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="loader-demo-title"
          >
            <h3 id="loader-demo-title" className="sr-only">
              Demo loading state
            </h3>
            {reducedMotion ? (
              <div className="h-12 w-12 rounded-full border-4 border-ui-bg-base border-t-transparent" />
            ) : (
              <motion.div
                className="h-14 w-14 rounded-full border-4 border-[#FF2E63] border-b-transparent border-l-transparent"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
              />
            )}
            <p className="mt-6 text-sm text-ui-bg-base">Rolling loader (demo only)</p>
            <button
              type="button"
              className="mt-8 rounded-full bg-ui-bg-base px-5 py-2 text-sm font-medium text-ui-fg-base"
              onClick={() => setOpen(false)}
            >
              Dismiss
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function TypewriterHeadline({ reducedMotion }: { reducedMotion: boolean }) {
  const text = "Motion that guides attention — without stealing it."
  const [len, setLen] = useState(reducedMotion ? text.length : 0)

  useEffect(() => {
    if (reducedMotion) {
      setLen(text.length)
      return
    }
    if (len >= text.length) {
      return
    }
    const t = window.setTimeout(() => setLen((n) => n + 1), 42)
    return () => clearTimeout(t)
  }, [len, reducedMotion, text.length])

  useEffect(() => {
    if (reducedMotion) {
      setLen(text.length)
    } else {
      setLen(0)
    }
  }, [reducedMotion, text])

  const visible = text.slice(0, len)

  return (
    <p className="font-mono text-base text-ui-fg-base small:text-lg">
      {visible}
      <span className="inline-block w-2 animate-pulse border-l-2 border-ui-fg-base align-baseline" />
    </p>
  )
}

function FloatingBlobs({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <p className="text-sm text-ui-fg-muted">
        Floating blobs disabled when reduced motion is preferred.
      </p>
    )
  }

  return (
    <div className="relative h-52 overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle">
      <motion.div
        className="absolute -left-8 top-6 h-36 w-36 rounded-full bg-[#FF2E63]/25 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-10 bottom-2 h-40 w-40 rounded-[40%] bg-indigo-400/30 blur-3xl"
        animate={{ x: [0, -32, 0], y: [0, -18, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-1/4 h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl"
        animate={{ scale: [1, 1.15, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="absolute bottom-3 left-3 right-3 text-center text-xs text-ui-fg-muted">
        CSS blur + Framer Motion (no WebGL).
      </p>
    </div>
  )
}

function CustomCursorPlayground() {
  const [pos, setPos] = useState({ x: 120, y: 80 })
  const [magnetic, setMagnetic] = useState(false)

  return (
    <div
      className="relative h-56 w-full cursor-none overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle"
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect()
        setPos({ x: e.clientX - b.left, y: e.clientY - b.top })
      }}
      onPointerLeave={() => setMagnetic(false)}
    >
      <div
        className="pointer-events-none absolute z-10 border-2 border-[#FF2E63] bg-transparent transition-[width,height,border-radius] duration-150 ease-out"
        style={{
          left: pos.x,
          top: pos.y,
          width: magnetic ? 56 : 30,
          height: magnetic ? 56 : 30,
          transform: "translate(-50%, -50%)",
          borderRadius: magnetic ? "22%" : "9999px",
        }}
      />
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="max-w-sm text-center text-sm text-ui-fg-muted">
          Global dot trail is off on this route. Hover the targets — the ring morphs.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-sm font-medium text-ui-fg-base"
            onPointerEnter={() => setMagnetic(true)}
            onPointerLeave={() => setMagnetic(false)}
          >
            Magnetic
          </button>
          <a
            href="#embed-social-lab"
            className="rounded-full border border-dashed border-ui-border-base px-4 py-2 text-sm text-ui-fg-subtle"
            onPointerEnter={() => setMagnetic(true)}
            onPointerLeave={() => setMagnetic(false)}
          >
            Link target
          </a>
        </div>
      </div>
    </div>
  )
}

function SocialEmbedSection() {
  const src = process.env.NEXT_PUBLIC_EMBED_SOCIAL_IFRAME_SRC

  if (src) {
    return (
      <iframe
        title="Embedded social feed"
        src={src}
        className="h-[420px] w-full rounded-xl border border-ui-border-base bg-ui-bg-subtle"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    )
  }

  return (
    <div
      id="embed-social-lab"
      className="rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle p-6 text-sm text-ui-fg-muted"
    >
      <p className="font-medium text-ui-fg-base">EmbedSocial / iframe placeholder</p>
      <p className="mt-2">
        Set <code className="text-ui-fg-base">NEXT_PUBLIC_EMBED_SOCIAL_IFRAME_SRC</code> to your
        vendor iframe URL (EmbedSocial, Taggbox, etc.). Leave unset for this safe fallback.
      </p>
    </div>
  )
}

export default function AnimationWidgetsDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const [snowOn, setSnowOn] = useState(true)

  const fireworkBurst = useCallback(() => {
    if (reducedMotion) {
      return
    }
    const count = 140
    const defaults = { origin: { y: 0.72 }, spread: 88, ticks: 220, gravity: 1.05, decay: 0.92 }

    confetti({
      ...defaults,
      particleCount: Math.floor(count * 0.35),
      scalar: 0.9,
      colors: ["#FF2E63", "#EEEEEE", "#fbbf24", "#6366f1"],
    })
    confetti({
      ...defaults,
      particleCount: Math.floor(count * 0.25),
      scalar: 0.75,
      colors: ["#FF2E63", "#f472b6"],
    })
  }, [reducedMotion])

  return (
    <div className="relative pb-24">
      <Section
        title="Lordicon-style animated icons"
        description="Hover or focus each control to replay. JSON is fetched from Lordicon’s CDN (host copies in production if uptime is critical)."
      >
        <LordiconBlock />
      </Section>

      <Section
        title="Lottie (scroll / view)"
        description="Vector animation loaded from a public Lottie JSON URL; playback follows visibility."
      >
        <LottieBlock reducedMotion={reducedMotion} />
      </Section>

      <Section
        title="Floating blobs"
        description="Lightweight gradient shapes for depth — no 3D runtime."
      >
        <FloatingBlobs reducedMotion={reducedMotion} />
      </Section>

      <Section
        title="Custom cursor playground"
        description="Only on this page the global trail cursor is disabled (see root layout)."
      >
        <CustomCursorPlayground />
      </Section>

      <Section
        title="Countdown"
        description="Fixed demo end date in code — swap for a real launch or sale."
      >
        <CountdownDisplay />
      </Section>

      <Section
        title="Before / after"
        description="Drag anywhere on the frame (pointer capture) to move the divider."
      >
        <BeforeAfterSlider />
      </Section>

      <Section
        title="Loading overlay"
        description="Local overlay mock — not a Next.js route loading.tsx."
      >
        <LoaderOverlayDemo reducedMotion={reducedMotion} />
      </Section>

      <Section
        title="Social embed"
        description="Optional iframe via environment variable."
      >
        <SocialEmbedSection />
      </Section>

      <Section
        title="Typewriter headline"
        description="Simple character reveal; respects reduced motion (shows full line)."
      >
        <TypewriterHeadline reducedMotion={reducedMotion} />
      </Section>

      <Section
        title="Particle field"
        description="tsParticles (slim) with grab interaction — lazy-loaded with this chunk."
      >
        <ParticlesBlock reducedMotion={reducedMotion} />
      </Section>

      <Section
        title="Snow + confetti burst"
        description="Snow uses react-snowfall; “fireworks” reuse canvas-confetti (no extra sim library)."
      >
        <div className="relative min-h-[200px] overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle">
          {!reducedMotion && snowOn ? (
            <Snowfall
              snowflakeCount={70}
              speed={[0.6, 1.2]}
              wind={[-0.4, 0.8]}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                top: 0,
                left: 0,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          ) : null}
          <div className="relative z-[1] flex flex-col items-start gap-4 p-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ui-fg-base">
              <input
                type="checkbox"
                checked={snowOn}
                onChange={(e) => setSnowOn(e.target.checked)}
                className="rounded border-ui-border-base"
                disabled={reducedMotion}
              />
              Snow {reducedMotion ? "(off — reduced motion)" : ""}
            </label>
            <button
              type="button"
              className="rounded-full bg-[#FF2E63] px-4 py-2 text-sm font-medium text-[#EEEEEE] disabled:opacity-50"
              onClick={fireworkBurst}
              disabled={reducedMotion}
            >
              Confetti burst
            </button>
          </div>
        </div>
      </Section>
    </div>
  )
}
