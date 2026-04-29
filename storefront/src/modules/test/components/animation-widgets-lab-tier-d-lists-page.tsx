"use client"

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  Reorder,
  useMotionValueEvent,
  useScroll,
  useVelocity,
} from "framer-motion"
import { useRef, useState } from "react"
import { useInView } from "react-intersection-observer"

const ROWS_INIT = [
  { id: "r1", name: "Premium tee" },
  { id: "r2", name: "Capsule cap" },
  { id: "r3", name: "Gift wrap" },
  { id: "r4", name: "Sticker pack" },
]

export function LabTierDReorderList({ reducedMotion }: { reducedMotion: boolean }) {
  const [items, setItems] = useState(ROWS_INIT)

  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className="max-w-sm space-y-2 list-none p-0">
      {items.map((item) => (
        <Reorder.Item
          key={item.id}
          value={item}
          dragListener={!reducedMotion}
          className="flex cursor-grab items-center gap-3 rounded-xl border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
        >
          <span className="text-ui-fg-muted">⋮⋮</span>
          {item.name}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

export function LabTierDExpandableTableRow({ reducedMotion: _reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="max-w-lg overflow-hidden rounded-xl border border-ui-border-base text-sm">
      <div className="grid grid-cols-3 gap-2 border-b border-ui-border-base bg-ui-bg-subtle px-4 py-2 font-medium text-ui-fg-muted">
        <span>Order</span>
        <span>Date</span>
        <span>Total</span>
      </div>
      <button
        type="button"
        className="grid w-full grid-cols-3 gap-2 border-b border-ui-border-base px-4 py-3 text-left hover:bg-ui-bg-subtle"
        onClick={() => setOpen((o) => !o)}
      >
        <span>#1042</span>
        <span>Apr 28</span>
        <span>$142</span>
      </button>
      <motion.div
        initial={false}
        animate={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        transition={_reducedMotion ? { duration: 0 } : { duration: 0.35 }}
        className="grid"
      >
        <div className="overflow-hidden">
          <div className="border-b border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-ui-fg-muted">
            <p className="font-medium text-ui-fg-base">Fulfillment</p>
            <p className="mt-1 text-xs">Packed at Sydney hub • AusPost express</p>
          </div>
        </div>
      </motion.div>
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        <span>#1038</span>
        <span>Apr 12</span>
        <span>$89</span>
      </div>
    </div>
  )
}

export function LabTierDFilterChips({ reducedMotion }: { reducedMotion: boolean }) {
  const [chips, setChips] = useState<string[]>([])

  const add = (t: string) => {
    if (!chips.includes(t)) {
      setChips((c) => [...c, t])
    }
  }

  return (
    <LayoutGroup>
      <div className="flex flex-wrap gap-2">
        {["Navy", "Oversized", "New"].map((t) => (
          <motion.button
            key={t}
            type="button"
            layout
            className="rounded-full border border-ui-border-base px-3 py-1 text-xs"
            onClick={() => add(t)}
          >
            + {t}
          </motion.button>
        ))}
      </div>
      <div className="mt-4 flex min-h-[2rem] flex-wrap gap-2">
        <AnimatePresence mode="popLayout">
          {chips.map((c) => (
            <motion.span
              key={c}
              layout
              initial={reducedMotion ? false : { opacity: 0, scale: 0.85, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0, marginLeft: 0, marginRight: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="inline-flex items-center gap-1 overflow-hidden rounded-full bg-[#FF2E63]/15 px-3 py-1 text-xs font-medium text-[#FF2E63]"
            >
              {c}
              <button type="button" className="text-ui-fg-muted hover:text-ui-fg-base" onClick={() => setChips((x) => x.filter((y) => y !== c))}>
                ×
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}

const SUGGEST = ["DTF navy tee", "Bulk cap pack", "Rush order fee", "Gift note"]

export function LabTierDSearchSuggest({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative max-w-sm">
      <input
        type="search"
        className="w-full rounded-lg border border-ui-border-base px-3 py-2 text-sm"
        placeholder="Search…"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      <AnimatePresence>
        {open ? (
          <motion.ul
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-lg"
            role="listbox"
          >
            {SUGGEST.map((s, i) => (
              <motion.li
                key={s}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reducedMotion ? 0 : 0.04 * i }}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-ui-bg-subtle"
                role="option"
              >
                {s}
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function LabTierDBreadcrumbMorph({ reducedMotion: _reducedMotion }: { reducedMotion: boolean }) {
  const [compact, setCompact] = useState(false)
  const crumbs = ["Shop", "Apparel", "Tees", "Premium", "Navy / M"]

  return (
    <div className="space-y-3">
      <button type="button" className="text-xs underline" onClick={() => setCompact((c) => !c)}>
        Toggle compact
      </button>
      <nav className="flex flex-wrap items-center gap-1 text-sm text-ui-fg-muted">
        {!compact ? (
          crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <span key={c} className="inline-flex items-center gap-1">
                {i > 0 ? <span>/</span> : null}
                {isLast ? (
                  <motion.span layoutId="last-crumb" className="font-semibold text-ui-fg-base">
                    {c}
                  </motion.span>
                ) : (
                  <span>{c}</span>
                )}
              </span>
            )
          })
        ) : (
          <>
            <span>…</span>
            <span>/</span>
            <motion.span layoutId="last-crumb" className="font-semibold text-ui-fg-base">
              {crumbs[crumbs.length - 1]}
            </motion.span>
          </>
        )}
      </nav>
    </div>
  )
}

export function LabTierDSectionDividerSweep({ reducedMotion }: { reducedMotion: boolean }) {
  const { ref, inView } = useInView({ threshold: 0.4, triggerOnce: true })

  return (
    <div ref={ref} className="py-8">
      <motion.div
        className="h-0.5 rounded-full bg-gradient-to-r from-[#FF2E63] to-transparent"
        initial={{ width: reducedMotion ? "100%" : "0%" }}
        animate={{ width: inView ? "100%" : reducedMotion ? "100%" : "0%" }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function LabTierDStickyCtaScrollDir({ reducedMotion }: { reducedMotion: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scrollerRef })
  const [show, setShow] = useState(true)
  const vel = useVelocity(scrollY)

  useMotionValueEvent(vel, "change", (v) => {
    if (reducedMotion) {
      setShow(true)
      return
    }
    if (v > 80) {
      setShow(false)
    } else if (v < -80) {
      setShow(true)
    }
  })

  return (
    <div
      ref={scrollerRef}
      className="relative h-48 overflow-auto rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4"
    >
      <p className="mb-24 text-sm text-ui-fg-muted">Scroll inside this panel — bar hides on fast down-scroll, shows on up-scroll.</p>
      <p className="mb-24 text-sm">More content…</p>
      <motion.div
        className="sticky bottom-3 z-10 mx-auto max-w-xs rounded-full bg-ui-fg-base px-4 py-2 text-center text-xs font-medium text-ui-bg-base shadow-lg"
        animate={{ y: show ? 0 : 80, opacity: show ? 1 : 0 }}
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
      >
        Secure checkout
      </motion.div>
    </div>
  )
}

export function LabTierDHeroSplitTextMask({ reducedMotion }: { reducedMotion: boolean }) {
  const { ref, inView } = useInView({ threshold: 0.35, triggerOnce: true })
  const line = "Premium DTF drops"

  return (
    <div ref={ref} className="overflow-hidden py-4">
      <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
        {line.split(" ").map((word, wi) => (
          <span key={wi} className="inline-block overflow-hidden mr-[0.25em]">
            <motion.span
              className="inline-block"
              initial={{ y: reducedMotion ? 0 : "100%" }}
              animate={{ y: inView ? 0 : reducedMotion ? 0 : "100%" }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.5, delay: wi * 0.06 }}
            >
              {word}
            </motion.span>
          </span>
        ))}
      </h2>
    </div>
  )
}

const LOGO_N = 12

export function LabTierDLogoWallWave({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-4 max-w-md">
      {Array.from({ length: LOGO_N }, (_, i) => (
        <motion.div
          key={i}
          className="flex h-12 items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-subtle text-xs font-bold text-ui-fg-muted"
          animate={
            reducedMotion
              ? {}
              : { opacity: [0.35, 1, 0.35] }
          }
          transition={{
            duration: 2.4,
            repeat: Infinity,
            delay: Math.sin(i * 0.7) * 0.5,
            ease: "easeInOut",
          }}
        >
          L{i + 1}
        </motion.div>
      ))}
    </div>
  )
}
