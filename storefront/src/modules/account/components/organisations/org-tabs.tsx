"use client"

import { useEffect, useMemo, useState } from "react"

export type OrgTabKey =
  | "overview"
  | "designs"
  | "inventory"
  | "destinations"
  | "orders"
  | "members"

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
  const [active, setActive] = useState<OrgTabKey>(() => {
    if (typeof window === "undefined") {
      return defaultTab ?? enabledTabs[0]?.key ?? "overview"
    }
    const hash = window.location.hash?.replace("#", "") as OrgTabKey | ""
    if (hash && enabledTabs.some((t) => t.key === hash)) return hash
    return defaultTab ?? enabledTabs[0]?.key ?? "overview"
  })

  // Sync URL hash on change
  useEffect(() => {
    if (typeof window === "undefined") return
    const desired = `#${active}`
    if (window.location.hash !== desired) {
      window.history.replaceState(null, "", desired)
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
              className={`relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11 ${
                isActive
                  ? "text-[var(--brand-primary)] after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-[var(--brand-secondary)]"
                  : "text-ui-fg-subtle hover:text-ui-fg-base"
              }`}
            >
              <span>{t.label}</span>
              {t.badge != null && t.badge !== "" ? (
                <span
                  className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                    isActive
                      ? "bg-[var(--brand-secondary)]/15 text-[var(--brand-primary)]"
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
