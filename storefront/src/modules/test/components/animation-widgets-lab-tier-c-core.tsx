"use client"

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useInView } from "react-intersection-observer"

const WORDS = ["fast", "beautiful", "scalable", "reliable"]

export function LabTierCDynamicIsland({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <LayoutGroup>
      <div className="flex flex-col items-center gap-4">
        <motion.button
          type="button"
          layout
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 overflow-hidden rounded-full border border-ui-border-base bg-ui-fg-base px-4 py-2 text-sm font-medium text-ui-bg-base shadow-md"
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
        >
          <motion.span layout className="whitespace-nowrap">
            {open ? "Now playing — print queue" : "Lab status"}
          </motion.span>
        </motion.button>
        <AnimatePresence>
          {open ? (
            <motion.div
              layoutId="island-panel"
              initial={reducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
              className="w-full max-w-md rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-4 text-sm text-ui-fg-base"
            >
              <p className="font-medium">Expanded island content</p>
              <p className="mt-2 text-xs text-ui-fg-muted">
                Toggle uses layout + AnimatePresence for crossfade. Reduced motion uses shorter transitions.
              </p>
              <button
                type="button"
                className="mt-3 text-xs underline text-ui-fg-muted"
                onClick={() => setOpen(false)}
              >
                Collapse
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}

const menuVariants = {
  hidden: { opacity: 0, y: -8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
}
const colVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0 },
}

export function LabTierCMegaMenuStagger({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Products ▾
      </button>
      <AnimatePresence>
        {open ? (
          reducedMotion ? (
            <div className="absolute left-0 z-20 mt-2 flex w-[min(100vw-2rem,28rem)] gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xl">
              {["Apparel", "Headwear", "Accessories"].map((col) => (
                <div key={col} className="flex-1">
                  <p className="text-xs font-bold uppercase text-ui-fg-muted">{col}</p>
                  <ul className="mt-2 space-y-1 text-sm text-ui-fg-base">
                    {["New", "Best sellers", "Clearance"].map((link) => (
                      <li key={link}>
                        <button type="button" className="hover:text-[#FF2E63]">
                          {link}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -4 }}
              variants={menuVariants}
              className="absolute left-0 z-20 mt-2 flex w-[min(100vw-2rem,28rem)] gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xl"
            >
              {["Apparel", "Headwear", "Accessories"].map((col) => (
                <motion.div key={col} variants={colVariants} className="flex-1">
                  <p className="text-xs font-bold uppercase text-ui-fg-muted">{col}</p>
                  <ul className="mt-2 space-y-1 text-sm text-ui-fg-base">
                    {["New", "Best sellers", "Clearance"].map((link) => (
                      <li key={link}>
                        <button type="button" className="hover:text-[#FF2E63]">
                          {link}
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          )
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function LabTierCSidebarSqueeze({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-ui-border-base px-3 py-1.5 text-sm"
      >
        {open ? "Close drawer" : "Open drawer (push layout)"}
      </button>
      <motion.div
        className="grid overflow-hidden rounded-xl border border-ui-border-base"
        animate={{
          gridTemplateColumns: open ? "1fr 140px" : "1fr 0fr",
        }}
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 32 }}
        style={{ display: "grid" }}
      >
        <div className="min-h-[100px] bg-ui-bg-subtle p-4 text-sm text-ui-fg-muted">
          Main column resizes when the drawer opens — tests grid reflow.
        </div>
        <motion.div
          className="min-w-0 overflow-hidden border-l border-ui-border-base bg-ui-bg-base"
          initial={false}
        >
          <div className="w-[140px] min-w-[140px] p-3 text-xs text-ui-fg-base">Filter drawer</div>
        </motion.div>
      </motion.div>
    </div>
  )
}

const fabActions = [
  { label: "A", deg: -50 },
  { label: "B", deg: -25 },
  { label: "C", deg: 0 },
]

export function LabTierCFabSpeedDial({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex h-40 items-end justify-center pb-4">
      <AnimatePresence>
        {open
          ? fabActions.map((a, i) => (
              <motion.button
                key={a.label}
                type="button"
                initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.5 }}
                animate={{
                  opacity: 1,
                  y: Math.sin((a.deg * Math.PI) / 180) * -56,
                  x: Math.cos((a.deg * Math.PI) / 180) * 56,
                  scale: 1,
                  rotate: open && !reducedMotion ? 360 : 0,
                }}
                exit={reducedMotion ? undefined : { opacity: 0, scale: 0.4, y: 0, x: 0 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 400, damping: 26, delay: i * 0.04 }
                }
                className="absolute bottom-10 h-10 w-10 rounded-full border border-ui-border-base bg-ui-bg-base text-sm font-bold shadow"
              >
                {a.label}
              </motion.button>
            ))
          : null}
      </AnimatePresence>
      <motion.button
        type="button"
        layout
        onClick={() => setOpen((o) => !o)}
        className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF2E63] text-2xl font-light text-[#EEEEEE] shadow-lg"
        animate={{ rotate: open && !reducedMotion ? 45 : 0 }}
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300 }}
      >
        +
      </motion.button>
    </div>
  )
}

export function LabTierCSwipeDeleteRow({ reducedMotion }: { reducedMotion: boolean }) {
  const [gone, setGone] = useState(false)

  if (gone) {
    return (
      <button
        type="button"
        className="text-sm text-ui-fg-muted underline"
        onClick={() => setGone(false)}
      >
        Restore row
      </button>
    )
  }

  return (
    <div className="relative max-w-md overflow-hidden rounded-xl border border-ui-border-base">
      <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-red-600 text-xs font-medium text-white">
        🗑
      </div>
      <motion.div
        drag={!reducedMotion ? "x" : false}
        dragConstraints={{ left: -88, right: 0 }}
        dragElastic={0.06}
        onDragEnd={(_, info) => {
          if (info.offset.x < -48 || info.velocity.x < -200) {
            setGone(true)
          }
        }}
        className="relative z-[1] flex items-center justify-between bg-ui-bg-base px-4 py-4"
      >
        <span className="text-sm text-ui-fg-base">Swipe left to delete (demo)</span>
      </motion.div>
    </div>
  )
}

export function LabTierCFloatingLabelInput() {
  const id = useId()
  return (
    <div className="relative max-w-sm">
      <input
        id={id}
        type="text"
        placeholder=" "
        className="peer w-full rounded-xl border border-ui-border-base bg-ui-bg-base px-3 pb-2 pt-5 text-sm text-ui-fg-base outline-none focus:border-[#FF2E63]"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-1/2 origin-left -translate-y-1/2 text-sm text-ui-fg-muted transition-all duration-200 peer-focus:top-3 peer-focus:translate-y-0 peer-focus:scale-75 peer-focus:text-[#FF2E63] peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:scale-75"
      >
        Email
      </label>
    </div>
  )
}

export function LabTierCLikeParticleBurst({ reducedMotion }: { reducedMotion: boolean }) {
  const [burstKey, setBurstKey] = useState(0)
  const [liked, setLiked] = useState(false)

  const onClick = () => {
    setLiked((l) => !l)
    setBurstKey((k) => k + 1)
  }

  return (
    <div className="relative flex items-center gap-3">
      <motion.button
        type="button"
        onClick={onClick}
        className="relative text-3xl"
        aria-label="Like"
        animate={liked ? { scale: [1, 1.2, 1] } : {}}
        transition={reducedMotion ? { duration: 0 } : {}}
      >
        {liked ? "♥" : "♡"}
        {!reducedMotion ? (
          <span className="pointer-events-none absolute left-1/2 top-1/2">
            {burstKey > 0
              ? Array.from({ length: 8 }, (_, i) => (
                  <motion.span
                    key={`${burstKey}-${i}`}
                    className="absolute h-1.5 w-1.5 rounded-full bg-[#FF2E63]"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{
                      x: Math.cos((i * Math.PI * 2) / 8) * 40,
                      y: Math.sin((i * Math.PI * 2) / 8) * 40,
                      opacity: 0,
                    }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                  />
                ))
              : null}
          </span>
        ) : null}
      </motion.button>
      <span className="text-xs text-ui-fg-muted">
        {reducedMotion ? "Reduced motion: scale only." : "Tap for particle burst."}
      </span>
    </div>
  )
}

function strengthScore(pw: string): number {
  let s = 0
  if (pw.length >= 8) {
    s++
  }
  if (/[A-Z]/.test(pw)) {
    s++
  }
  if (/[0-9]/.test(pw)) {
    s++
  }
  if (/[^A-Za-z0-9]/.test(pw)) {
    s++
  }
  return Math.min(s, 4)
}

export function LabTierCPasswordStrengthMeter({ reducedMotion }: { reducedMotion: boolean }) {
  const [pw, setPw] = useState("")
  const score = strengthScore(pw)
  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-400", "bg-emerald-500"]
  const activeColor = score > 0 ? colors[Math.min(score, 4) - 1] : "bg-ui-border-base"

  return (
    <div className="max-w-sm space-y-2">
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
        placeholder="Type a password…"
      />
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-ui-border-base">
            <motion.div
              className={`h-full w-full origin-left rounded-full ${i < score ? activeColor : "bg-ui-bg-subtle"}`}
              initial={false}
              animate={{ scaleX: i < score ? 1 : 0.15 }}
              transition={
                reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 26 }
              }
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-ui-fg-muted">Score {score}/4 — per-segment spring fill</p>
    </div>
  )
}

export function LabTierCPullRefreshTeardrop({ reducedMotion }: { reducedMotion: boolean }) {
  const [y, setY] = useState(0)
  const dragging = useRef(false)
  const startY = useRef(0)

  const stretch = Math.min(Math.max(y, 0), 80)

  return (
    <div
      className="relative flex max-w-sm flex-col items-center rounded-xl border border-ui-border-base bg-ui-bg-subtle py-10 select-none touch-none"
      onPointerDown={(e) => {
        dragging.current = true
        startY.current = e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!dragging.current) {
          return
        }
        const dy = Math.max(0, e.clientY - startY.current)
        if (!reducedMotion) {
          setY(dy)
        }
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        setY(0)
      }}
    >
      <svg width="48" height="72" viewBox="0 0 48 72" className="text-[#FF2E63]" aria-hidden>
        <motion.path
          fill="currentColor"
          d={`M 24 8 Q 24 ${8 + stretch * 0.8} 24 ${24 + stretch} Q 12 ${32 + stretch} 24 ${48 + stretch * 0.3} Q 36 ${32 + stretch} 24 ${24 + stretch} Q 24 ${8 + stretch * 0.8} 24 8 Z`}
          animate={reducedMotion ? {} : { opacity: stretch > 8 ? 1 : 0.6 }}
        />
      </svg>
      <p className="mt-2 max-w-[12rem] text-center text-xs text-ui-fg-muted">
        Drag down in this box — teardrop stretches (lab mock, not real pull-to-refresh).
      </p>
    </div>
  )
}

export function LabTierCTextHighlightMarker({ reducedMotion }: { reducedMotion: boolean }) {
  const { ref, inView } = useInView({ threshold: 0.35, triggerOnce: true })

  return (
    <p ref={ref} className="max-w-lg text-lg text-ui-fg-base">
      We ship{" "}
      <motion.span
        className="relative inline"
        initial={false}
      >
        <span className="relative z-[1]">decorated merch</span>
        <motion.span
          className="absolute bottom-0 left-0 right-0 top-[55%] z-0 origin-left rounded-sm bg-[#FF2E63]/35"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: inView ? 1 : 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.55, ease: "easeOut" }}
        />
      </motion.span>{" "}
      Australia-wide.
    </p>
  )
}

export function LabTierCSlotMachineWords({ reducedMotion }: { reducedMotion: boolean }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (reducedMotion) {
      return undefined
    }
    const id = window.setInterval(() => setIdx((i) => (i + 1) % WORDS.length), 2200)
    return () => window.clearInterval(id)
  }, [reducedMotion])

  const word = WORDS[reducedMotion ? 0 : idx]

  return (
    <p className="text-lg text-ui-fg-base">
      We build{" "}
      <span className="relative inline-block min-w-[7rem] overflow-hidden align-bottom font-semibold text-[#FF2E63]">
        <AnimatePresence mode="wait">
          <motion.span
            key={word}
            initial={reducedMotion ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? undefined : { y: -16, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.25 }}
            className="inline-block"
          >
            {word}
          </motion.span>
        </AnimatePresence>
      </span>{" "}
      apps.
    </p>
  )
}

export function LabTierCMarqueeOutlineFill({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle py-4">
      {reducedMotion ? (
        <p className="px-4 text-center text-2xl font-black uppercase text-ui-fg-base">Outline static</p>
      ) : (
        <motion.div
          className="flex w-max"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        >
          {["SCROLL • ", "OUTLINE • ", "FILL • ", "LAB • "].map((t) => (
            <span
              key={t}
              className="bg-gradient-to-r from-[#FF2E63] via-indigo-500 to-[#FF2E63] bg-clip-text px-2 text-3xl font-black uppercase text-transparent"
              style={{ WebkitTextStroke: "1px rgba(100,100,100,0.35)" }}
            >
              {t}
            </span>
          ))}
          {["SCROLL • ", "OUTLINE • ", "FILL • ", "LAB • "].map((t) => (
            <span
              key={`b-${t}`}
              className="bg-gradient-to-r from-[#FF2E63] via-indigo-500 to-[#FF2E63] bg-clip-text px-2 text-3xl font-black uppercase text-transparent"
              style={{ WebkitTextStroke: "1px rgba(100,100,100,0.35)" }}
            >
              {t}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  )
}

export function LabTierCCurtainWipeImage({ reducedMotion }: { reducedMotion: boolean }) {
  const { ref, inView } = useInView({ threshold: 0.3, triggerOnce: true })

  return (
    <div ref={ref} className="relative mx-auto max-w-lg overflow-hidden rounded-xl border border-ui-border-base">
      <img
        src="https://picsum.photos/seed/curtainc/640/380"
        alt=""
        className="h-52 w-full object-cover"
      />
      <motion.div
        className="absolute inset-0 bg-ui-fg-base"
        initial={false}
        animate={{
          clipPath: inView ? "inset(0 0% 0 0)" : reducedMotion ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
        }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

type Edge = "top" | "right" | "bottom" | "left"

export function LabTierCDirectionalHoverOverlay() {
  const [edge, setEdge] = useState<Edge>("bottom")
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const onEnter = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) {
      return
    }
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    if (Math.abs(dx) > Math.abs(dy)) {
      setEdge(dx > 0 ? "right" : "left")
    } else {
      setEdge(dy > 0 ? "bottom" : "top")
    }
    setHover(true)
  }

  const from = {
    top: { x: "0%", y: "-100%" },
    bottom: { x: "0%", y: "100%" },
    left: { x: "-100%", y: "0%" },
    right: { x: "100%", y: "0%" },
  }[edge]

  return (
    <div
      ref={ref}
      className="relative mx-auto max-w-sm overflow-hidden rounded-xl border border-ui-border-base"
      onPointerEnter={onEnter}
      onPointerLeave={() => setHover(false)}
    >
      <img src="https://picsum.photos/seed/directionalc/480/280" alt="" className="h-44 w-full object-cover" />
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#FF2E63]/85 text-sm font-medium text-[#EEEEEE]"
        initial={false}
        animate={hover ? { x: "0%", y: "0%" } : from}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      />
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[10px] text-white">
        Hover — overlay slides from nearest edge
      </p>
    </div>
  )
}

export function LabTierCGlitchHover({ reducedMotion }: { reducedMotion: boolean }) {
  const [active, setActive] = useState(false)
  const [slice, setSlice] = useState(0)

  useEffect(() => {
    if (reducedMotion || !active) {
      return undefined
    }
    const id = window.setInterval(() => {
      setSlice(Math.floor(Math.random() * 8))
    }, 90)
    const off = window.setTimeout(() => setActive(false), 1200)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(off)
    }
  }, [active, reducedMotion])

  if (reducedMotion) {
    return (
      <p className="rounded-xl border border-dashed border-ui-border-base p-6 text-sm text-ui-fg-muted">
        Glitch demo disabled for prefers-reduced-motion.
      </p>
    )
  }

  const clip = `inset(${(slice * 12) % 100}% 0 ${100 - ((slice * 12) % 100) - 8}% 0)`

  return (
    <button
      type="button"
      className="w-full max-w-md rounded-xl border border-ui-border-base bg-ui-fg-base px-6 py-8 text-left text-xl font-bold text-[#EEEEEE] transition-shadow"
      style={{
        clipPath: active ? clip : "none",
        textShadow: active
          ? "2px 0 #FF2E63, -2px 0 cyan"
          : "none",
      }}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
    >
      Hover briefly — clipped RGB offset (capped)
    </button>
  )
}

export function LabTierCGridPolkaDrift({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      className={`h-36 rounded-xl border border-ui-border-base ${reducedMotion ? "" : "animate-[polka-drift_22s_linear_infinite]"}`}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,46,99,0.2) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
        ...(reducedMotion
          ? {}
          : {
              animationName: "polka-drift",
              animationDuration: "22s",
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
            }),
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes polka-drift { to { background-position: 120px 80px; } }`,
        }}
      />
      {!reducedMotion ? null : (
        <p className="p-4 text-xs text-ui-fg-muted">Static grid — drift off for reduced motion.</p>
      )}
    </div>
  )
}

export function LabTierCFluidCursorTrail({ reducedMotion }: { reducedMotion: boolean }) {
  const [target, setTarget] = useState({ x: 160, y: 70 })
  const tx = useMotionValue(160)
  const ty = useMotionValue(70)
  const sx = useSpring(tx, { stiffness: 200, damping: 24 })
  const sy = useSpring(ty, { stiffness: 200, damping: 24 })

  useEffect(() => {
    tx.set(target.x)
    ty.set(target.y)
  }, [target, tx, ty])

  if (reducedMotion) {
    return <p className="text-sm text-ui-fg-muted">Fluid trail off — reduced motion.</p>
  }

  return (
    <div
      className="relative h-40 w-full cursor-crosshair overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle"
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect()
        setTarget({ x: e.clientX - b.left, y: e.clientY - b.top })
      }}
    >
      <motion.div
        className="pointer-events-none absolute h-6 w-6 rounded-full border border-[#FF2E63]/60"
        style={{ left: sx, top: sy, translateX: "-50%", translateY: "-50%" }}
      />
      <div
        className="pointer-events-none absolute h-3 w-3 rounded-full bg-[#FF2E63]"
        style={{ left: target.x, top: target.y, transform: "translate(-50%, -50%)" }}
      />
    </div>
  )
}
export function LabTierCNeonFlicker({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    return <p className="text-lg font-semibold text-[#FF2E63]">Neon headline (static)</p>
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes neon-flicker {
            0%, 100% { opacity: 1; filter: drop-shadow(0 0 6px #FF2E63); }
            45% { opacity: 0.88; filter: drop-shadow(0 0 2px #FF2E63); }
            48% { opacity: 0.4; filter: drop-shadow(0 0 1px #aaa); }
            52% { opacity: 1; filter: drop-shadow(0 0 8px #FF2E63); }
          }
        `,
        }}
      />
      <p
        className="text-2xl font-black uppercase tracking-wide text-[#FF2E63]"
        style={{ animation: "neon-flicker 2.8s ease-in-out infinite" }}
      >
        Open late
      </p>
    </>
  )
}

export function LabTierCGaugeNeedle({ reducedMotion }: { reducedMotion: boolean }) {
  const [v, setV] = useState(42)
  const angle = -90 + (v / 100) * 180
  const mv = useMotionValue(angle)
  const rot = useSpring(mv, { stiffness: 120, damping: 18 })

  useEffect(() => {
    mv.set(angle)
  }, [angle, mv])

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="200" height="110" viewBox="0 0 200 110" aria-hidden>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" className="stroke-ui-border-base" strokeWidth="10" />
        <motion.g style={{ rotate: rot, transformOrigin: "100px 100px" }}>
          <line x1="100" y1="100" x2="100" y2="35" className="stroke-[#FF2E63]" strokeWidth="4" strokeLinecap="round" />
        </motion.g>
      </svg>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        disabled={reducedMotion}
        onChange={(e) => setV(Number(e.target.value))}
        className="w-48 accent-[#FF2E63]"
      />
    </div>
  )
}

export function LabTierCActivityHeatmap({ reducedMotion }: { reducedMotion: boolean }) {
  const cols = 8
  const rows = 4
  const { ref, inView } = useInView({ threshold: 0.2, triggerOnce: true })

  const cells = useMemo(() => {
    const g: { c: number; r: number; level: number }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        g.push({ c, r, level: (c + r * 3) % 5 })
      }
    }
    return g
  }, [])

  return (
    <div ref={ref} className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {cells.map((cell) => (
        <motion.div
          key={`${cell.c}-${cell.r}`}
          className="h-5 w-5 rounded-sm bg-[#FF2E63]"
          initial={false}
          animate={{
            opacity: inView ? 0.2 + cell.level * 0.18 : 0,
            scale: inView ? 1 : 0.6,
          }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { delay: cell.c * 0.04 + cell.r * 0.02, duration: 0.35, ease: "easeOut" }
          }
        />
      ))}
    </div>
  )
}

const PIE_ANGLES = [
  { label: "A", start: 0, delta: 110, color: "#FF2E63" },
  { label: "B", start: 110, delta: 85, color: "#6366f1" },
  { label: "C", start: 195, delta: 165, color: "#34d399" },
]

function piePath(cx: number, cy: number, r: number, start: number, delta: number) {
  const rad = Math.PI / 180
  const x1 = cx + r * Math.cos(start * rad)
  const y1 = cy + r * Math.sin(start * rad)
  const x2 = cx + r * Math.cos((start + delta) * rad)
  const y2 = cy + r * Math.sin((start + delta) * rad)
  const large = delta > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
}

export function LabTierCPiePullOut() {
  const mid = PIE_ANGLES.map((s) => ({
    ...s,
    mid: s.start + s.delta / 2,
  }))

  return (
    <svg width="220" height="220" viewBox="0 0 220 220" className="mx-auto">
      {mid.map((s) => {
        const rad = (s.mid * Math.PI) / 180
        const dx = Math.cos(rad) * 6
        const dy = Math.sin(rad) * 6
        return (
          <motion.path
            key={s.label}
            d={piePath(110, 110, 80, s.start, s.delta)}
            fill={s.color}
            stroke="white"
            strokeWidth="2"
            whileHover={{ x: dx, y: dy, scale: 1.04 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            style={{ transformOrigin: "110px 110px", cursor: "pointer" }}
          />
        )
      })}
    </svg>
  )
}
