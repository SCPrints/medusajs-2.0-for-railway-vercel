import {
  SEASONAL_THEMES,
  THEME_PARAM,
  THEME_STORAGE_KEY,
  THEME_TIMEZONE,
} from "./config"

/** Compact config embedded in the inline <head> script. */
export type ThemeInitConfig = {
  tz: string
  key: string
  param: string
  /** n = name, s/e = window start/end as MMDD numbers, o = order-by MMDD. */
  themes: { n: string; s: number; e: number; o?: number }[]
}

export type ThemeSource = "param" | "saved" | "date"

export type ThemeInitResult = {
  theme: string
  source: ThemeSource
  /** Theme the date alone selects ("classic" outside every window). */
  season: string
  /** The in-season theme's order-by date has passed (Sydney time). */
  late: boolean
}

/** The browser globals the script reads; tests pass a stand-in or null. */
export type ThemeWindowLike = {
  location: { search: string }
  localStorage?: StorageLike
  document: { documentElement: { setAttribute(name: string, value: string): void } }
  __scpTheme?: ThemeInitResult
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

/** Test overrides; each wins over the corresponding `win` read. */
export type ThemeInitEnv = {
  now?: Date
  search?: string
  storage?: StorageLike | null
  root?: { setAttribute(name: string, value: string): void } | null
}

const toMonthDay = (mmdd: string) => Number(mmdd.replace("-", ""))

export const THEME_INIT_CONFIG: ThemeInitConfig = {
  tz: THEME_TIMEZONE,
  key: THEME_STORAGE_KEY,
  param: THEME_PARAM,
  themes: SEASONAL_THEMES.map((t) => ({
    n: t.name,
    s: toMonthDay(t.window.start),
    e: toMonthDay(t.window.end),
    ...(t.orderBy ? { o: toMonthDay(t.orderBy) } : {}),
  })),
}

/**
 * Picks the theme (param > saved > date > classic) and stamps it on <html>.
 *
 * MUST stay self-contained (no imports, no outer-scope references): it is
 * serialised with `.toString()` into the inline <head> script so it runs
 * before first paint. Tests call it directly with an injected `env`.
 *
 * The browser is passed in as `win` rather than read from the `window`
 * global on purpose: this function is bundled for the SERVER (the root
 * layout), where Turbopack folds `typeof window` to "undefined" and strips
 * every branch behind it — the serialised script would then never read the
 * URL, storage or <html>. A parameter can't be folded. Keep `window`,
 * `document` and `process` out of this body.
 *
 * Today is read as MMDD in Sydney time (device clock if Intl fails). Storage
 * failures (private mode, blocked site data) are swallowed — the theme still
 * applies for this load. A saved choice only counts in the season it was
 * made in — opting out of Halloween doesn't also opt you out of Christmas,
 * and a Halloween opt-in doesn't leak into December.
 */
export function runThemeInit(
  cfg: ThemeInitConfig,
  win: ThemeWindowLike | null,
  env?: ThemeInitEnv
): ThemeInitResult {
  const e = env || {}
  const w = win
  const now = e.now || new Date()
  const search = e.search != null ? e.search : w ? w.location.search : ""
  let storage: StorageLike | null = null
  if (e.storage !== undefined) storage = e.storage
  else {
    try {
      storage = w && w.localStorage ? w.localStorage : null
    } catch (_) {
      storage = null
    }
  }
  const root = e.root !== undefined ? e.root : w ? w.document.documentElement : null

  let md = (now.getMonth() + 1) * 100 + now.getDate()
  try {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: cfg.tz,
      month: "numeric",
      day: "numeric",
    }).formatToParts(now)
    let m = 0
    let d = 0
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === "month") m = Number(parts[i].value)
      if (parts[i].type === "day") d = Number(parts[i].value)
    }
    if (m && d) md = m * 100 + d
  } catch (_) {
    /* device clock */
  }

  const known: Record<string, { o?: number; e?: number }> = { classic: {} }
  let season = "classic"
  for (let i = 0; i < cfg.themes.length; i++) {
    const t = cfg.themes[i]
    known[t.n] = t
    const inWindow = t.s <= t.e ? md >= t.s && md <= t.e : md >= t.s || md <= t.e
    if (season === "classic" && inWindow) season = t.n
  }

  let theme = season
  let source: ThemeSource = "date"
  let param: string | null = null
  try {
    param = new URLSearchParams(search).get(cfg.param)
  } catch (_) {
    param = null
  }
  if (param && known[param]) {
    theme = param
    source = "param"
    try {
      if (storage) storage.setItem(cfg.key, param + "|" + season)
    } catch (_) {
      storage = null
    }
  } else {
    let saved: string | null = null
    try {
      saved = storage ? storage.getItem(cfg.key) : null
    } catch (_) {
      saved = null
    }
    if (saved) {
      const bits = saved.split("|")
      if (known[bits[0]] && bits[1] === season) {
        theme = bits[0]
        source = "saved"
      }
    }
  }

  // Late is a property of the SEASON (date), not the applied theme, so a
  // visitor who switches the seasonal look back on via the toggle still sees
  // the post-cut-off copy.
  const cut = known[season].o
  const late = !!(cut && md > cut)
  if (root) {
    root.setAttribute("data-theme", theme)
    if (late) root.setAttribute("data-theme-late", "")
  }
  const result = { theme: theme, source: source, season: season, late: late }
  if (w && e.root === undefined) w.__scpTheme = result
  return result
}

/** The inline script for the root layout <head> (~2.5 KB raw, ~1 KB gzipped). */
export function buildThemeInitScript(cfg: ThemeInitConfig = THEME_INIT_CONFIG): string {
  return `try{(${runThemeInit.toString()})(${JSON.stringify(cfg)},window)}catch(e){}`
}
