import {
  buildThemeInitScript,
  runThemeInit,
  THEME_INIT_CONFIG,
  type ThemeInitConfig,
} from "./init-script"
import { formatMonthDay } from "./config"

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

const fakeRoot = () => {
  const attrs: Record<string, string> = {}
  return { attrs, setAttribute: (n: string, v: string) => (attrs[n] = v) }
}

// Mid-October in Sydney (AEDT, UTC+11).
const OCT_17 = new Date("2026-10-17T02:00:00Z")
// Mid-March: no seasonal theme.
const MAR_10 = new Date("2026-03-10T02:00:00Z")

const run = (
  now: Date,
  opts: { search?: string; storage?: ReturnType<typeof memoryStorage> | null } = {}
) => {
  const root = fakeRoot()
  const res = runThemeInit(THEME_INIT_CONFIG, null, {
    now,
    search: opts.search ?? "",
    storage: opts.storage === undefined ? memoryStorage() : opts.storage,
    root,
  })
  return { ...res, attrs: root.attrs }
}

describe("runThemeInit — precedence", () => {
  it("uses the date-based seasonal theme by default", () => {
    const r = run(OCT_17)
    expect(r).toMatchObject({ theme: "halloween", source: "date", season: "halloween" })
    expect(r.attrs["data-theme"]).toBe("halloween")
  })

  it("falls back to classic outside every window", () => {
    expect(run(MAR_10)).toMatchObject({ theme: "classic", source: "date", season: "classic" })
  })

  it("a saved choice beats the date (same season)", () => {
    const storage = memoryStorage({ "scp-theme": "classic|halloween" })
    expect(run(OCT_17, { storage })).toMatchObject({ theme: "classic", source: "saved" })
  })

  it("ignores a saved choice from a different season", () => {
    // A "classic" saved outside the season doesn't block Halloween, and a
    // Halloween opt-in doesn't leak into the classic season.
    const storage = memoryStorage({ "scp-theme": "classic|classic" })
    expect(run(OCT_17, { storage })).toMatchObject({ theme: "halloween", source: "date" })
    const optIn = memoryStorage({ "scp-theme": "halloween|halloween" })
    expect(run(MAR_10, { storage: optIn })).toMatchObject({ theme: "classic", source: "date" })
  })

  it("ignores unknown saved values", () => {
    const storage = memoryStorage({ "scp-theme": "vaporwave|halloween" })
    expect(run(OCT_17, { storage })).toMatchObject({ theme: "halloween", source: "date" })
  })

  it("?theme= beats a saved choice and persists for the season", () => {
    const storage = memoryStorage({ "scp-theme": "classic|halloween" })
    const r = run(OCT_17, { search: "?theme=halloween", storage })
    expect(r).toMatchObject({ theme: "halloween", source: "param" })
    expect(storage.data["scp-theme"]).toBe("halloween|halloween")
  })

  it("?theme= previews a theme out of season", () => {
    const storage = memoryStorage()
    expect(run(MAR_10, { search: "?theme=halloween", storage })).toMatchObject({
      theme: "halloween",
      source: "param",
      season: "classic",
    })
    expect(storage.data["scp-theme"]).toBe("halloween|classic")
  })

  it("ignores unknown ?theme= values", () => {
    expect(run(OCT_17, { search: "?theme=nope" })).toMatchObject({
      theme: "halloween",
      source: "date",
    })
  })

  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    const root = fakeRoot()
    const r = runThemeInit(THEME_INIT_CONFIG, null, {
      now: OCT_17,
      search: "?theme=classic",
      storage: throwing,
      root,
    })
    expect(r.theme).toBe("classic")
    expect(root.attrs["data-theme"]).toBe("classic")
  })

  it("works with no storage at all", () => {
    expect(run(OCT_17, { storage: null }).theme).toBe("halloween")
  })
})

describe("runThemeInit — Sydney-time boundaries", () => {
  // 1 Oct 00:30 AEST (DST starts first Sunday of Oct; 1 Oct 2026 is AEST, UTC+10)
  // = 30 Sep 14:30 UTC — already October in Sydney.
  it("starts at Sydney midnight on 1 Oct even though UTC is still September", () => {
    expect(run(new Date("2026-09-30T14:30:00Z")).theme).toBe("halloween")
  })

  it("is still classic at 23:59 on 30 Sep Sydney time", () => {
    expect(run(new Date("2026-09-30T13:59:00Z")).theme).toBe("classic")
  })

  // 1 Nov is inclusive; 2 Nov 00:00 AEDT = 1 Nov 13:00 UTC.
  it("is still halloween at 23:59 on 1 Nov Sydney time", () => {
    expect(run(new Date("2026-11-01T12:59:00Z")).theme).toBe("halloween")
  })

  it("ends at Sydney midnight on 2 Nov even though UTC is still 1 Nov", () => {
    expect(run(new Date("2026-11-01T13:00:00Z")).theme).toBe("classic")
  })
})

describe("runThemeInit — order-by cut-off", () => {
  it("defaults the cut-off to 24 October", () => {
    expect(THEME_INIT_CONFIG.themes.find((t) => t.n === "halloween")?.o).toBe(1024)
  })

  it("is not late on the cut-off day", () => {
    const r = run(new Date("2026-10-24T05:00:00Z"))
    expect(r.late).toBe(false)
    expect(r.attrs["data-theme-late"]).toBeUndefined()
  })

  it("is late the day after the cut-off", () => {
    const r = run(new Date("2026-10-25T05:00:00Z"))
    expect(r.late).toBe(true)
    expect(r.attrs["data-theme-late"]).toBe("")
  })

  it("follows the season, so switching the look back on still shows the late copy", () => {
    const storage = memoryStorage({ "scp-theme": "classic|halloween" })
    const r = run(new Date("2026-10-25T05:00:00Z"), { storage })
    expect(r.theme).toBe("classic")
    expect(r.attrs["data-theme-late"]).toBe("")
  })

  it("is never late outside the season", () => {
    expect(run(MAR_10, { search: "?theme=halloween" }).late).toBe(false)
  })
})

describe("runThemeInit — windows that wrap the new year", () => {
  const cfg: ThemeInitConfig = {
    ...THEME_INIT_CONFIG,
    themes: [{ n: "newyear", s: 1228, e: 103 }],
  }
  const at = (iso: string) =>
    runThemeInit(cfg, null, { now: new Date(iso), search: "", storage: null, root: null }).theme

  it("covers both sides of 1 January", () => {
    expect(at("2026-12-29T02:00:00Z")).toBe("newyear")
    expect(at("2027-01-02T02:00:00Z")).toBe("newyear")
    expect(at("2027-01-05T02:00:00Z")).toBe("classic")
    expect(at("2026-12-20T02:00:00Z")).toBe("classic")
  })
})

describe("buildThemeInitScript", () => {
  const runScript = (search: string, storage = memoryStorage()) => {
    const attrs: Record<string, string> = {}
    const fakeWindow: any = {
      location: { search },
      localStorage: storage,
      document: { documentElement: { setAttribute: (n: string, v: string) => (attrs[n] = v) } },
    }
    // Run the script text with a stand-in `window` in scope.
    new Function("window", buildThemeInitScript())(fakeWindow)
    return { attrs, fakeWindow }
  }

  it("serialises into a self-contained script that sets data-theme", () => {
    const { attrs, fakeWindow } = runScript("?theme=halloween")
    expect(attrs["data-theme"]).toBe("halloween")
    expect(fakeWindow.__scpTheme).toMatchObject({ theme: "halloween", source: "param" })
  })

  it("reads the saved choice through the window it is handed", () => {
    const { attrs } = runScript("", memoryStorage({ "scp-theme": "classic|halloween" }))
    // Out of season in CI? The saved season must match today's; make it robust.
    const season = runThemeInit(THEME_INIT_CONFIG, null, { storage: null, root: null }).season
    expect(attrs["data-theme"]).toBe(season === "halloween" ? "classic" : season)
  })

  it("never references the window global (server bundlers fold `typeof window`)", () => {
    const body = runThemeInit.toString()
    expect(body).not.toMatch(/typeof window|[^.\w]document\.|[^.\w]process\./)
    expect(body).toMatch(/location\.search/)
  })

  it("stays small", () => {
    expect(buildThemeInitScript().length).toBeLessThan(3500)
  })
})

describe("formatMonthDay", () => {
  it("formats MM-DD without a year", () => {
    expect(formatMonthDay("10-20")).toBe("20 October")
  })
})
