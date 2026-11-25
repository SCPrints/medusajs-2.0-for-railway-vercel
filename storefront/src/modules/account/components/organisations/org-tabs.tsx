"use client"

import { useEffect, useMemo, useRef, useState } from "react"

export type OrgTabKey =
  | "overview"
  | "range"
  | "people"
  | "allowance"
  | "designs"
  | "inventory"
  | "destinations"
  | "orders"
  | "members"
  | "account"
  | "approvals"
  | "invoices"
  | "brand_kit"

export type OrgTabDef = {
  key: OrgTabKey
  label: string
  badge?: string | number | null
  gated?: boolean
}

type Props = {
  tabs: OrgTabDef[]
  defaultTab?: OrgTabKey
  panels: Partial<Record<OrgTabKey, React.ReactNode>>
}

/**
 * Horizontal tab bar for the org detail page (Phase 2 Q9). Persists
 * the active tab in the URL hash so a reload / back-button preserves
 * the customer's place. Mobile: horizontal scroll within the tab row
 * (no dropdown — easier to glance the available tabs while scrolled).
 */
export default function OrgTabs({ tabs, defaultTab, panels }: Props) {
  const enabledTabs = useMemo(() => tabs.filter((t) => !t.gated), [tabs])
  // Start on the server's tab and read the #hash after mounting: reading it in
  // the first render made the browser disagree with the server's HTML, so a
  // link or reload to #approvals showed Overview (and a hydration error).
  const [active, setActive] = useState<OrgTabKey>(defaultTab ?? enabledTabs[0]?.key ?? "overview")
  const [hashRead, setHashRead] = useState(false)
  useEffect(() => {
    const hash = window.location.hash?.replace("#", "") as OrgTabKey | ""
    if (hash && enabledTabs.some((t) => t.key === hash)) setActive(hash)
    setHashRead(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync URL hash on change (not before the hash was read, or it would be overwritten)
  useEffect(() => {
    if (typeof window === "undefined" || !hashRead) return
    const desired = `#${active}`
    if (window.location.hash !== desired) {
      window.history.replaceState(null, "", desired)
    }
  }, [active, hashRead])

  // A link to #orders or #invoices opens a tab past the visible end of the
  // scrolling strip: bring it into view. Scrolls the strip only, never the page.
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = stripRef.current
    const tab = strip?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!strip || !tab) return
    const s = strip.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    if (t.left < s.left || t.right > s.right) {
      strip.scrollLeft += t.left - s.left - (s.width - t.width) / 2
    }
  }, [active])

  // Listen for back/forward hash changes
  useEffect(() => {
    if (typeof window === "undefined") return
    const onHashChange = () => {
      const hash = window.location.hash?.replace("#", "") as OrgTabKey | ""
      if (hash && enabledTabs.some((t) => t.key === hash)) setActive(hash)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [enabledTabs])

  return (
    <div className="w-full">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Organisation sections"
        className="-mx-4 flex overflow-x-auto border-b border-ui-border-base px-4 small:mx-0 small:px-0"
      >
        {enabledTabs.map((t) => {
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`org-tab-panel-${t.key}`}
              id={`org-tab-${t.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(t.key)}
              className={`relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold transition focus:outline-hidden focus-visible:ring-2 min-h-11 ${
                isActive
                  ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-brand"
                  : "text-ui-fg-subtle hover:text-ui-fg-base"
              }`}
            >
              <span>{t.label}</span>
              {t.badge != null && t.badge !== "" ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                    isActive
                      ? " text-ink"
                      : "bg-ui-bg-subtle text-ui-fg-muted"
                  }`}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="pt-6">
        {enabledTabs.map((t) => {
          const isActive = t.key === active
          return (
            <div
              key={t.key}
              role="tabpanel"
              id={`org-tab-panel-${t.key}`}
              aria-labelledby={`org-tab-${t.key}`}
              hidden={!isActive}
            >
              {isActive ? panels[t.key] ?? null : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
