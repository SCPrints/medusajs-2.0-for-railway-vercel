"use client"

import { useEffect, type ReactNode } from "react"

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Optional max-height of the sheet panel. Defaults to 85dvh. */
  maxHeight?: string
}

/**
 * Mobile bottom sheet — slides up from the bottom of the viewport with a
 * backdrop overlay. Body scroll is locked while open so the underlying page
 * doesn't shift around. Closes on backdrop tap, ESC key, or explicit X.
 *
 * SSR-safe: renders unconditionally in DOM and toggles via CSS data-state
 * + transform. Pointer-events: none on the wrapper when closed so taps pass
 * through to the page underneath.
 *
 * Not portaled — relies on `fixed` positioning to escape any transforms.
 * For deeply-nested transform containers (CSS `transform` on an ancestor
 * breaks `position: fixed`), wrap in a portal at the call site.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85dvh",
}: Props) {
  useEffect(() => {
    if (typeof document === "undefined") return
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  return (
    <div
      data-state={open ? "open" : "closed"}
      className={
        "fixed inset-0 z-50 flex flex-col justify-end transition-opacity duration-200 " +
        (open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
      }
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        tabIndex={open ? 0 : -1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          "relative flex flex-col rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ease-out " +
          (open ? "translate-y-0" : "translate-y-full")
        }
        style={{
          maxHeight,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-ui-bg-subtle" aria-hidden />
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-base font-semibold text-ui-fg-base">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-ui-fg-subtle hover:bg-ui-bg-subtle"
            tabIndex={open ? 0 : -1}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-ui-border-base px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}
