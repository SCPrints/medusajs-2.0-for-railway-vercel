"use client"

import { getSeasonalTheme } from "@lib/themes/config"
import { setTheme, useActiveTheme, useThemeInit } from "@lib/themes/client"

/**
 * "Halloween look ◐" switch. Only rendered while a seasonal theme is in its
 * date window (or being previewed via ?theme=). Renders nothing on the server
 * and on the first client render, so it can't mismatch the static HTML.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const theme = useActiveTheme()
  const init = useThemeInit()
  if (!init) return null

  const seasonalName = init.season !== "classic" ? init.season : theme
  const seasonal = getSeasonalTheme(seasonalName)
  if (!seasonal) return null

  const on = theme === seasonal.name

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setTheme(on ? "classic" : seasonal.name)}
      className={
        "inline-flex min-h-11 items-center gap-3 rounded-full px-1 text-sm font-medium text-ui-fg-subtle transition-colors hover:text-ui-fg-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-secondary)]" +
        (className ? ` ${className}` : "")
      }
      data-testid="theme-toggle"
      data-no-squish
    >
      <span>{seasonal.label} look</span>
      <span
        aria-hidden
        className={
          "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
          (on ? "bg-[var(--brand-secondary)]" : "bg-ui-fg-subtle")
        }
      >
        <span
          className={
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none " +
            (on ? "translate-x-5" : "translate-x-0")
          }
        />
      </span>
    </button>
  )
}
