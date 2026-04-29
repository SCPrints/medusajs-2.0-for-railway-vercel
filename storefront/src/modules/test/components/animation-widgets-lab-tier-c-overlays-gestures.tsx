"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useId, useRef, useState } from "react"

export function LabTierCJellyButton({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.button
      type="button"
      className="rounded-full bg-[#FF2E63] px-8 py-3 text-sm font-semibold text-[#EEEEEE]"
      whileTap={
        reducedMotion
          ? {}
          : {
              scale: [1, 1.22, 0.88, 1.08, 1],
              borderRadius: ["9999px", "40%", "9999px"],
            }
      }
      transition={{ duration: 0.55, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut" }}
    >
      Squashy CTA
    </motion.button>
  )
}

export function LabTierCPinchZoomBox({ reducedMotion }: { reducedMotion: boolean }) {
  const [s, setS] = useState(1)

  const onWheel = (e: React.WheelEvent) => {
    if (reducedMotion || !e.ctrlKey) {
      return
    }
    e.preventDefault()
    setS((prev) => Math.min(2.2, Math.max(0.6, prev - e.deltaY * 0.004)))
  }

  return (
    <div
      className="relative mx-auto h-48 max-w-xs overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle"
      onWheel={onWheel}
    >
      <motion.div className="flex h-full w-full items-center justify-center bg-ui-bg-base" style={{ scale: s }}>
        <img
          src="https://picsum.photos/seed/pinchzoom/400/300"
          alt=""
          className="h-full w-full object-cover"
        />
      </motion.div>
      <p className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white">
        {reducedMotion
          ? "Reduced motion: zoom disabled."
          : "Pinch on trackpad (⌃ scroll) or Ctrl+wheel to zoom — lab simulation."}
      </p>
    </div>
  )
}

export function LabTierCDraggablePip({ reducedMotion }: { reducedMotion: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={wrapRef} className="relative h-48 rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle">
      <p className="p-3 text-xs text-ui-fg-muted">Drag the tile — constrained to the dashed area (PiP-style).</p>
      <motion.div
        drag={!reducedMotion}
        dragConstraints={wrapRef}
        dragMomentum={false}
        className="absolute left-2 top-10 h-16 w-24 cursor-grab overflow-hidden rounded-lg border border-ui-border-base bg-ui-fg-base text-center text-[10px] text-ui-bg-base shadow-lg active:cursor-grabbing"
      >
        <div className="flex h-full items-center justify-center px-1">Mini PiP</div>
      </motion.div>
    </div>
  )
}

export function LabTierCCommandPalette({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  return (
    <div className="space-y-2">
      <p className="text-xs text-ui-fg-muted">
        Press <kbd className="rounded border px-1">⌘</kbd>/<kbd className="rounded border px-1">Ctrl</kbd>+
        <kbd className="rounded border px-1">K</kbd> (global within this page).
      </p>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[240] flex items-start justify-center bg-ui-fg-base/40 pt-[15vh] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-title`}
              className="w-full max-w-lg rounded-2xl border border-ui-border-base bg-ui-bg-base p-4 shadow-2xl"
              initial={reducedMotion ? false : { scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { scale: 0.96, opacity: 0, y: 8 }}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id={`${id}-title`} className="sr-only">
                Command palette
              </h3>
              <input
                ref={inputRef}
                type="search"
                placeholder="Search commands…"
                className="w-full rounded-xl border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-sm outline-none focus:border-[#FF2E63]"
              />
              <ul className="mt-3 space-y-1 text-sm text-ui-fg-muted">
                <li>Open store</li>
                <li>Go to contact</li>
              </ul>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function LabTierCCascadingContextMenu() {
  const [open, setOpen] = useState(false)

  const items = ["Copy", "Duplicate", "Archive", "Delete"]

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="rounded-full border border-ui-border-base px-4 py-2 text-sm"
        onClick={() => setOpen((o) => !o)}
      >
        Open menu
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            className="absolute left-0 z-30 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base py-1 shadow-xl"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            role="menu"
          >
            {items.map((label, i) => (
              <motion.li
                key={label}
                role="menuitem"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.035, type: "spring", stiffness: 400, damping: 28 }}
              >
                <button type="button" className="w-full px-4 py-2 text-left text-sm hover:bg-ui-bg-subtle">
                  {label}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function LabTierCNotificationDrawer({ reducedMotion }: { reducedMotion: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        className="rounded-full border border-ui-border-base px-4 py-2 text-sm"
        onClick={() => setOpen(true)}
      >
        Open notifications
      </button>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-[220] bg-ui-fg-base/35"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed bottom-0 right-0 top-0 z-[230] w-[min(100vw-1rem,20rem)] border-l border-ui-border-base bg-ui-bg-base shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32 }}
            >
              <div className="flex items-center justify-between border-b border-ui-border-base p-4">
                <h3 className="text-sm font-semibold">Alerts</h3>
                <button type="button" className="text-xs underline" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <ul className="space-y-2 p-4 text-sm text-ui-fg-muted">
                <li>Order #1024 shipped</li>
                <li>New quote request</li>
              </ul>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
