// Builds storefront/src/data/pantone-screen-chart.json from the real Pantone books, so the
// hex on the guide page is the book's Lab value converted — not hand-typed.
//
//   node scripts/pantone/build-chart.mjs
//
// Two outputs: the curated CHART (groups with notes, edited below) and the LIBRARY — every colour
// in pressed-swatches.txt (the names found in the studio's swatch-book .ai files) resolved against
// the books in BOOKS order. Edit, re-run, commit the JSON.
import { readFileSync, writeFileSync } from "node:fs"
import { labToRgb, readAcb } from "./acb-to-json.mjs"

const HOME = process.env.HOME
const AI = (v) => `/Applications/Adobe Illustrator ${v}/Presets.localized/en_US/Swatches/`
// Newest edition first — a name in several books takes the first one's values.
// The 2020 book is last only for the handful of base-ink names V4 dropped (Bright Green C, Strong Red C…).
const BOOKS = [
  AI(2026) + "PANTONE Solid Coated-V4.acb",
  HOME + "/Downloads/Pantone-color-libraries-master/PANTONE+ Pastels & Neons Coated.acb",
  HOME + "/Downloads/Pantone-color-libraries-master/PANTONE+ Metallics Solid Coated.acb",
  AI(2020) + "Color Books/PANTONE+ Solid Coated.acb",
]
const PRESSED = new URL("./pressed-swatches.txt", import.meta.url)
const OUT = new URL("../../storefront/src/data/pantone-screen-chart.json", import.meta.url)

// The base inks plus the numbers that come up on real jobs, with notes.
const CHART = [
  {
    category: "The base inks",
    description:
      "Every solid Pantone colour is a recipe mixed from these inks. If your brand colour is one of them it is the easiest kind of match there is.",
    colors: [
      ["Yellow C"], ["Yellow 012 C"], ["Orange 021 C"], ["Warm Red C"], ["Red 032 C"], ["Rubine Red C"],
      ["Rhodamine Red C", "Very bright pink-red. Hard to hit with process printing — one of the reasons to screen print it."],
      ["Purple C"], ["Violet C"], ["Blue 072 C"],
      ["Reflex Blue C", "Famously hard to judge on screen. Trust the fan deck, not the monitor."],
      ["Process Blue C"], ["Green C"], ["Black C"],
    ],
  },
  {
    category: "Reds",
    description: "Reds are where RGB previews mislead most. The pressed swatch is the reference.",
    colors: [["485 C", "The classic signage red."], ["Bright Red C"], ["1795 C"], ["186 C"], ["199 C"], ["200 C"], ["Strong Red C"]],
  },
  {
    category: "Oranges and yellows",
    description: "Opaque on white; on dark garments these need a white underbase to keep their punch.",
    colors: [["Bright Orange C"], ["1585 C"], ["165 C"], ["151 C"], ["1375 C"], ["1235 C"], ["123 C"], ["7408 C"], ["116 C"], ["109 C"], ["Medium Yellow C"]],
  },
  {
    category: "Greens",
    description: "From sports greens to teals. Darker greens read lighter on screen than they print.",
    colors: [["382 C"], ["376 C"], ["354 C"], ["355 C"], ["347 C"], ["7739 C"], ["348 C"], ["3425 C"], ["Bright Green C"], ["3272 C"], ["320 C"], ["7466 C"]],
  },
  {
    category: "Blues",
    description: "The most requested family for school, club and corporate work. Navies 289 C and 2965 C sit close to a black garment — tell us the garment colour.",
    colors: [["2925 C"], ["299 C"], ["3005 C"], ["300 C"], ["2945 C"], ["293 C"], ["2728 C"], ["286 C"], ["287 C"], ["288 C"], ["294 C"], ["7462 C"], ["289 C"], ["2965 C"]],
  },
  {
    category: "Purples and pinks",
    description: "Clean purples and pinks are a strength of spot inks — process printing dulls them.",
    colors: [["2685 C"], ["268 C"], ["266 C"], ["2602 C"], ["Medium Purple C"], ["Pink C"], ["219 C"], ["226 C"], ["212 C"]],
  },
  {
    category: "Greys, blacks and browns",
    description: "Cool greys lean blue, warm greys lean brown. On coloured garments a grey shifts toward the garment unless it is underbased.",
    colors: [
      ["Cool Gray 1 C"], ["Cool Gray 3 C"], ["Cool Gray 5 C"], ["Cool Gray 7 C"], ["Cool Gray 9 C"], ["Cool Gray 11 C"],
      ["Warm Gray 1 C"], ["Warm Gray 5 C"], ["Warm Gray 9 C"], ["Warm Gray 11 C"],
      ["430 C"], ["432 C"], ["7540 C"], ["426 C"],
      ["Black 6 C", "Deeper and bluer than Black C."],
      ["476 C"], ["1545 C"], ["7503 C"],
    ],
  },
  {
    category: "Fluorescents",
    description: "Printed with dedicated fluoro inks, not mixed from the base set. Need a white underbase on darks and fade faster in sunlight than standard inks.",
    colors: [["801 C"], ["802 C"], ["803 C"], ["804 C"], ["805 C"], ["806 C"], ["807 C"]],
  },
  {
    category: "Metallics",
    description: "Metallic flake inks. No screen can show the sparkle, so the swatch below is only the base tone.",
    colors: [["871 C", "Metallic gold."], ["877 C", "Metallic silver."]],
  },
]

const all = new Map() // "485 C" → colour; first book wins
for (const f of BOOKS) for (const c of readAcb(readFileSync(f)).colours) {
  const key = c.name.replace(/^PANTONE /, "")
  if (!all.has(key)) all.set(key, c)
}

// Self-check on the conversion: white and black must land on the corners.
console.assert(labToRgb([100, 0, 0]).join() === "255,255,255" && labToRgb([0, 0, 0]).join() === "0,0,0", "labToRgb corners")

const pressed = readFileSync(PRESSED, "utf8").split("\n").filter((l) => l && !l.startsWith("#"))
const pressedSet = new Set(pressed)
const missing = pressed.filter((n) => !all.has(n.replace(/^PANTONE /, "")))
if (missing.length) console.warn(`not in any book, skipped: ${missing.join(", ")}`)

const out = {
  pantone_chart: CHART.map((cat) => ({
    ...cat,
    colors: cat.colors.map(([name, notes]) => {
      const c = all.get(name)
      if (!c) throw new Error(`not in the books: ${name}`)
      return { name: `PANTONE ${name}`, hex: c.hex, lab: c.lab, ...(notes ? { notes } : {}) }
    }),
  })),
  // Book order (roughly by hue family, the order designers know), only what the studio has pressed.
  library: [...all.values()].filter((c) => pressedSet.has(c.name)).map((c) => ({ name: c.name, hex: c.hex })),
}
writeFileSync(OUT, JSON.stringify(out) + "\n")
console.log(`wrote ${out.pantone_chart.reduce((n, c) => n + c.colors.length, 0)} curated + ${out.library.length} library colours to ${OUT.pathname}`)
