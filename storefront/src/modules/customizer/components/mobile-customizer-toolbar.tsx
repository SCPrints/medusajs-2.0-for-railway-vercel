"use client"

import { useEffect, useState } from "react"

export type ToolbarActionId = "sides" | "add-art" | "add-text" | "pricing"

type Action = {
  id: ToolbarActionId
  label: string
  anchorId: string
  icon: React.ReactNode
}

const ACTIONS: Action[] = [
  {
    id: "sides",
    label: "Sides",
    anchorId: "customizer-side-selector",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="20"
        height="20"
        aria-hidden
      >
        <path d="M6 4l-3 3 3 3" />
        <path d="M3 7h14a4 4 0 014 4v0" />
        <path d="M18 20l3-3-3-3" />
        <path d="M21 17H7a4 4 0 01-4-4v0" />
      </svg>
    ),
  },
  {
    id: "add-art",
    label: "Add art",
    anchorId: "customizer-input-panel",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="20"
        height="20"
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.5" />
        <path d="M21 16l-5-5-6 6" />
      </svg>
    ),
  },
  {
    id: "add-text",
    label: "Text",
    anchorId: "customizer-input-panel",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="20"
        height="20"
        aria-hidden
      >
        <path d="M5 7V5h14v2" />
        <path d="M12 5v14" />
        <path d="M9 19h6" />
      </svg>
    ),
  },
  {
    id: "pricing",
    label: "Price",
    anchorId: "customizer-pricing-panel",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="20"
        height="20"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M14 9h-3.5a1.5 1.5 0 000 3h3a1.5 1.5 0 010 3H10" />
        <path d="M12 7v10" />
      </svg>
    ),
  },
]

function scrollToAnchor(anchorId: string) {
  if (typeof document === "undefined") return
  const el = document.getElementById(anchorId)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "start" })
  // Fallback for iOS Safari where smooth scrolling sometimes ignores the
  // request — re-issue a hard scroll a beat later if we didn't actually move.
  window.setTimeout(() => {
    const rect = el.getBoundingClientRect()
    if (Math.abs(rect.top) > 120) {
      window.scrollTo({
        top: window.scrollY + rect.top - 80,
        behavior: "smooth",
      })
    }
  }, 350)
}

type Props = {
  /**
   * Optional handler. When provided, each toolbar button calls
   * `onAction(id)` and the toolbar's job is done — the caller manages
   * whatever sheet/dialog opens next. When omitted, the toolbar falls back
   * to the legacy anchor-scroll behaviour so it stays useful in places
   * that haven't migrated to bottom sheets yet.
   */
  onAction?: (id: ToolbarActionId) => void
}

/**
 * Phone-only sticky toolbar pinned to the bottom of the customizer page.
 * Hidden on `tablet:` (768px+) where the side-by-side desktop layout makes
 * mobile navigation unnecessary. Renders nothing until the user has
 * scrolled past ~40% of the viewport so the toolbar doesn't fight the
 * canvas surface for tap area during initial design placement.
 */
export default function MobileCustomizerToolbar({ onAction }: Props = {}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.4)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible) return null

  const handleClick = (action: Action) => {
    if (onAction) {
      onAction(action.id)
      return
    }
    scrollToAnchor(action.anchorId)
  }

  return (
    <div
      className="tablet:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none"
      data-testid="mobile-customizer-toolbar"
    >
      <div
        className="pointer-events-auto border-t border-ui-border-base bg-white/95 backdrop-blur"
        style={{
          paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="content-container flex items-stretch justify-around">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleClick(action)}
              className="inline-flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium text-ui-fg-subtle transition hover:text-ui-fg-base active:scale-95"
              aria-label={`Open ${action.label}`}
            >
              <span className="text-ui-fg-base">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
