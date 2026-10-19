/**
 * Seasonal site themes — the ONE place to declare a theme and when it runs.
 *
 * A theme is a `data-theme="<name>"` attribute on <html>, set before first
 * paint by the inline script built in `./init-script.ts`. Each theme's colours
 * live in `src/styles/themes.css` (a `[data-theme="<name>"]` block that
 * redefines the colour tokens); decorations are lazy-loaded client components
 * under `src/modules/themes/<name>/`.
 *
 * Date windows are evaluated in Australia/Sydney time and are INCLUSIVE.
 * A window may wrap the new year (e.g. start "12-01", end "01-02").
 */

export type ThemeName = "classic" | "halloween"

export type SeasonalTheme = {
  name: Exclude<ThemeName, "classic">
  /** Shown in the footer toggle: "<label> look". */
  label: string
  /** Inclusive Sydney-time window, "MM-DD". */
  window: { start: string; end: string }
  /**
   * Optional "order by" cut-off ("MM-DD") for the seasonal promo copy. After
   * this date the page gets `data-theme-late` and the promo swaps to its
   * late-season variant, so we never advertise a deadline that has passed.
   * Staff: move this to match current production + shipping lead times.
   */
  orderBy?: string
}

/**
 * Halloween "order by" cut-off, "MM-DD". Override per deploy with
 * HALLOWEEN_ORDER_CUTOFF (read at build/render time on the server). Once the
 * date has passed the "Order by …" hero line is hidden automatically and the
 * late-season line shows instead (see `data-theme-late`).
 */
const HALLOWEEN_ORDER_CUTOFF_DEFAULT = "10-24"
const envCutoff = process.env.HALLOWEEN_ORDER_CUTOFF
export const HALLOWEEN_ORDER_CUTOFF =
  envCutoff && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(envCutoff)
    ? envCutoff
    : HALLOWEEN_ORDER_CUTOFF_DEFAULT

export const SEASONAL_THEMES: SeasonalTheme[] = [
  {
    name: "halloween",
    label: "Halloween",
    window: { start: "10-01", end: "11-01" },
    orderBy: HALLOWEEN_ORDER_CUTOFF,
  },
]

export const THEME_TIMEZONE = "Australia/Sydney"
/** localStorage key; value is `<theme>|<season it was chosen in>`. */
export const THEME_STORAGE_KEY = "scp-theme"
/** `?theme=<name>` previews a theme (and remembers it for this season). */
export const THEME_PARAM = "theme"
/** sessionStorage flag so `theme_applied` fires once per session. */
export const THEME_APPLIED_SESSION_KEY = "scp-theme-applied"
/** Window event fired when the theme changes after load (toggle). */
export const THEME_CHANGE_EVENT = "scp-theme-change"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** "10-20" → "20 October". Year-free on purpose so static HTML never goes stale. */
export function formatMonthDay(monthDay: string): string {
  const [m, d] = monthDay.split("-").map(Number)
  return `${d} ${MONTHS[m - 1] ?? ""}`.trim()
}

export function getSeasonalTheme(name: string): SeasonalTheme | undefined {
  return SEASONAL_THEMES.find((t) => t.name === name)
}
