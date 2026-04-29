"use client"

import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { useInView } from "react-intersection-observer"

const CART_LINES = [
  { id: "1", label: "DTF Tee — Navy / M", price: "$48" },
  { id: "2", label: "Cap — Black", price: "$32" },
]

export function LabTierDMiniCartDropdown({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="rounded-full border border-ui-border-base bg-ui-bg-base px-4 py-2 text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Cart (2)
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
            className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xl"
          >
            <div className="max-h-64 divide-y divide-ui-border-base">
              {CART_LINES.map((line, i) => (
                <motion.div
                  key={line.id}
                  initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reducedMotion ? 0 : 0.05 * i }}
                  className="flex justify-between px-4 py-3 text-sm"
                >
                  <span className="text-ui-fg-base">{line.label}</span>
                  <span className="text-ui-fg-muted">{line.price}</span>
                </motion.div>
              ))}
            </div>
            <div className="border-t border-ui-border-base p-3">
              <button type="button" className="w-full rounded-lg bg-ui-fg-base py-2 text-sm text-ui-bg-base">
                Checkout
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function LabTierDQtyStepper({ reducedMotion }: { reducedMotion: boolean }) {
  const [n, setN] = useState(1)
  const [shake, setShake] = useState(0)

  const bump = (delta: number) => {
    const next = n + delta
    if (next < 1 || next > 9) {
      setShake((k) => k + 1)
      return
    }
    setN(next)
  }

  return (
    <div className="flex items-center gap-3">
      <motion.div
        key={shake}
        animate={shake && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.35 }}
        className="flex items-center rounded-full border border-ui-border-base"
      >
        <motion.button
          type="button"
          className="px-3 py-2 text-lg"
          onClick={() => bump(-1)}
          whileTap={reducedMotion ? {} : { scale: 0.88 }}
        >
          −
        </motion.button>
        <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">{n}</span>
        <motion.button
          type="button"
          className="px-3 py-2 text-lg"
          onClick={() => bump(1)}
          whileTap={reducedMotion ? {} : { scale: 0.88 }}
        >
          +
        </motion.button>
      </motion.div>
      <span className="text-xs text-ui-fg-muted">Clamp 1–9 — shakes at bounds</span>
    </div>
  )
}

export function LabTierDCartUndoToast({ reducedMotion }: { reducedMotion: boolean }) {
  const [items, setItems] = useState(CART_LINES)
  const [undo, setUndo] = useState<typeof CART_LINES[0] | null>(null)

  const removeFirst = () => {
    const [head, ...rest] = items
    if (!head) {
      return
    }
    setItems(rest)
    setUndo(head)
    window.setTimeout(() => setUndo(null), 4000)
  }

  const doUndo = () => {
    if (undo) {
      setItems((prev) => [undo, ...prev])
      setUndo(null)
    }
  }

  return (
    <div className="space-y-4">
      <ul className="max-w-sm divide-y divide-ui-border-base rounded-xl border border-ui-border-base">
        <AnimatePresence initial={false}>
          {items.map((line) => (
            <motion.li
              key={line.id}
              layout
              initial={false}
              exit={reducedMotion ? undefined : { opacity: 0, x: -40 }}
              className="flex justify-between px-4 py-3 text-sm"
            >
              <span>{line.label}</span>
              <span className="text-ui-fg-muted">{line.price}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <button type="button" className="text-sm underline" onClick={removeFirst} disabled={items.length === 0}>
        Remove first line
      </button>
      <AnimatePresence>
        {undo ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex max-w-sm items-center justify-between rounded-lg bg-ui-fg-base px-3 py-2 text-xs text-ui-bg-base"
          >
            <span>Removed — undo?</span>
            <button type="button" className="font-semibold underline" onClick={doUndo}>
              Undo
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

const ADDR = [
  { id: "a", name: "Home", line: "12 Wharf Rd, Sydney" },
  { id: "b", name: "Studio", line: "Unit 4 / 88 Smith St, Melbourne" },
]

export function LabTierDAddressCardExpand({ reducedMotion }: { reducedMotion: boolean }) {
  const [sel, setSel] = useState("a")

  return (
    <div className="max-w-md space-y-2">
      {ADDR.map((a) => {
        const on = sel === a.id
        return (
          <motion.button
            key={a.id}
            type="button"
            layout
            onClick={() => setSel(a.id)}
            className={`w-full rounded-xl border p-4 text-left text-sm transition-colors ${
              on ? "border-[#FF2E63] bg-[#FF2E63]/5" : "border-ui-border-base bg-ui-bg-subtle opacity-80"
            }`}
            animate={on && !reducedMotion ? { scale: [1, 1.02, 1] } : { scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <span className="font-semibold text-ui-fg-base">{a.name}</span>
            <p className="mt-1 text-ui-fg-muted">{a.line}</p>
          </motion.button>
        )
      })}
    </div>
  )
}

export function LabTierDPromoCheckmark({ reducedMotion }: { reducedMotion: boolean }) {
  const [ok, setOk] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        defaultValue="SAVE10"
        className="rounded-lg border border-ui-border-base px-3 py-2 text-sm"
        aria-label="Promo code"
      />
      <button type="button" className="rounded-lg border border-ui-border-base px-3 py-2 text-sm" onClick={() => setOk(true)}>
        Apply
      </button>
      <AnimatePresence>
        {ok ? (
          <motion.span
            initial={false}
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600"
            animate={reducedMotion ? {} : { scale: [1, 1.1, 1] }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" className="text-emerald-600" aria-hidden>
              <motion.path
                d="M5 12l5 5L20 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.4 }}
              />
            </svg>
            Applied
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

const STEPS = [
  { id: "o", label: "Ordered", done: true },
  { id: "s", label: "Shipped", done: true },
  { id: "t", label: "In transit", done: false },
  { id: "d", label: "Delivered", done: false },
]

export function LabTierDOrderTimeline({ reducedMotion }: { reducedMotion: boolean }) {
  const { ref, inView } = useInView({ threshold: 0.25, triggerOnce: true })

  return (
    <div ref={ref} className="max-w-sm space-y-0">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <motion.div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? "bg-emerald-500 text-white" : "border border-ui-border-base bg-ui-bg-base"
              }`}
              initial={false}
              animate={{ scale: inView && s.done && !reducedMotion ? [1, 1.15, 1] : 1 }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
            >
              {s.done ? "✓" : i + 1}
            </motion.div>
            {i < STEPS.length - 1 ? (
              <div className="relative w-0.5 flex-1 min-h-[28px] bg-ui-border-base">
                <motion.div
                  className="absolute inset-x-0 top-0 h-full origin-top bg-emerald-500"
                  initial={{ scaleY: 0 }}
                  animate={{
                    scaleY: inView && s.done ? 1 : reducedMotion && s.done ? 1 : 0,
                  }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.55, delay: 0.12 + i * 0.08 }}
                />
              </div>
            ) : null}
          </div>
          <div className="pb-4 pt-1">
            <p className="text-sm font-medium text-ui-fg-base">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function LabTierDTrustBadgeCarousel({ reducedMotion }: { reducedMotion: boolean }) {
  const [pause, setPause] = useState(false)
  const x = useMotionValue(0)
  const labels = ["Secure", "AfterPay", "Carbon neutral", "AusPost", "Easy returns", "DTF quality"]

  useEffect(() => {
    if (reducedMotion) {
      return undefined
    }
    if (pause) {
      return undefined
    }
    const ctrl = animate(x, [0, -280], {
      duration: 22,
      repeat: Infinity,
      ease: "linear",
      repeatType: "loop",
    })
    return () => ctrl.stop()
  }, [reducedMotion, pause, x])

  return (
    <div
      className="overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle py-3"
      onPointerEnter={() => setPause(true)}
      onPointerLeave={() => setPause(false)}
    >
      {reducedMotion ? (
        <div className="flex flex-wrap justify-center gap-4 px-4 text-xs font-medium text-ui-fg-muted">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : (
        <motion.div style={{ x }} className="flex w-max gap-10 px-4">
          {[...labels, ...labels, ...labels].map((l, i) => (
            <span key={`${l}-${i}`} className="whitespace-nowrap text-xs font-semibold text-ui-fg-muted">
              {l}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  )
}

const QUOTES = [
  { t: "Prints survived our club wash test.", a: "— Alex C." },
  { t: "Turnaround beat expectations.", a: "— Sam R." },
  { t: "Colours matched our brand kit.", a: "— Jordan K." },
]

export function LabTierDReviewCarouselDrag({ reducedMotion }: { reducedMotion: boolean }) {
  const [idx, setIdx] = useState(0)
  const block = 280
  const x = useMotionValue(-idx * block)

  useEffect(() => {
    if (reducedMotion) {
      x.set(-idx * block)
      return
    }
    const ctrl = animate(x, -idx * block, { type: "spring", stiffness: 380, damping: 32 })
    return () => ctrl.stop()
  }, [idx, reducedMotion, x])

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-ui-border-base">
      <motion.div
        style={{ x }}
        drag={!reducedMotion ? "x" : false}
        dragConstraints={{ left: -(QUOTES.length - 1) * block, right: 0 }}
        dragElastic={0.12}
        onDragEnd={() => {
          const next = Math.round(-x.get() / block)
          setIdx(Math.max(0, Math.min(QUOTES.length - 1, next)))
        }}
        className="flex w-max cursor-grab active:cursor-grabbing"
      >
        {QUOTES.map((q) => (
          <div key={q.a} style={{ width: block }} className="flex-shrink-0 p-6">
            <p className="text-sm text-ui-fg-base">{q.t}</p>
            <p className="mt-2 text-xs text-ui-fg-muted">{q.a}</p>
          </div>
        ))}
      </motion.div>
      <div className="flex justify-center gap-1 pb-3">
        {QUOTES.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`h-2 w-2 rounded-full ${i === idx ? "bg-[#FF2E63]" : "bg-ui-border-base"}`}
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

export function LabTierDUGCMasonry({ reducedMotion }: { reducedMotion: boolean }) {
  const pics = useMemo(() => [12, 34, 56, 78, 90, 21].map((s) => `https://picsum.photos/seed/ugc${s}/200/${150 + (s % 3) * 40}`), [])
  const { ref, inView } = useInView({ threshold: 0.15, triggerOnce: true })

  return (
    <div ref={ref} className="columns-3 gap-2 space-y-2 max-w-md">
      {pics.map((src, i) => (
        <motion.img
          key={src}
          src={src}
          alt=""
          className="mb-2 w-full rounded-lg break-inside-avoid"
          initial={false}
          animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 12 }}
          transition={
            reducedMotion ? { duration: 0 } : { delay: (i % 3) * 0.08 + Math.floor(i / 3) * 0.06, duration: 0.4 }
          }
        />
      ))}
    </div>
  )
}

export function LabTierDAsSeenCrossfade({ reducedMotion }: { reducedMotion: boolean }) {
  const [i, setI] = useState(0)
  const labels = ["Vogue", "Broadsheet", "Timeout", "Pedestrian"]

  useEffect(() => {
    if (reducedMotion) {
      return undefined
    }
    const id = window.setInterval(() => setI((j) => (j + 1) % labels.length), 2600)
    return () => window.clearInterval(id)
  }, [labels.length, reducedMotion])

  return (
    <div className="flex h-16 items-center justify-center rounded-xl border border-ui-border-base bg-ui-bg-subtle">
      <AnimatePresence mode="wait">
        <motion.span
          key={labels[reducedMotion ? 0 : i]}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          className="text-lg font-bold tracking-widest text-ui-fg-muted"
        >
          {labels[reducedMotion ? 0 : i].toUpperCase()}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

export function LabTierDStockCountdownPulse({ reducedMotion }: { reducedMotion: boolean }) {
  const [sec, setSec] = useState(120)

  useEffect(() => {
    if (sec <= 0) {
      return undefined
    }
    const id = window.setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [sec])

  const mm = Math.floor(sec / 60)
  const ss = sec % 60

  return (
    <div className="max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <motion.p
        className="text-sm font-medium text-amber-800"
        animate={reducedMotion || sec > 30 ? {} : { opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        Cart reserved: {mm}:{ss.toString().padStart(2, "0")}
      </motion.p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-amber-200">
        <motion.div
          className="h-full bg-amber-500"
          animate={{ width: `${(sec / 120) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  )
}
