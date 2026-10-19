/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync, writeFileSync } from "node:fs"

import { Bat, Boo, Cloud, Cobweb, Ghost, InkDefs, Moon, Pumpkin, Skyline, fillPath, inkPath } from "./art"
import { CandyCorn, CapSpider, CatInBox, Mummy, Patchwork, Skeleton, StampGhost, Vampire, Witch, ZombieHand } from "./cast"

// CSS modules aren't transformed by the jest config; echo class names back.
jest.mock("./halloween.module.css", () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, k) => String(k) }),
}))

const MASCOTS = {
  Ghost, Boo, Pumpkin, Bat, Moon, Cloud, Skyline, Cobweb,
  Skeleton, Witch, CatInBox, Mummy, Patchwork, Vampire, ZombieHand, CapSpider, CandyCorn, StampGhost,
}
const CAST = ["Skeleton", "Witch", "CatInBox", "Mummy", "Patchwork", "Vampire", "ZombieHand", "CapSpider", "CandyCorn", "StampGhost"]

describe("ink helpers", () => {
  const pts = [[0, 0, 0], [10, 0, 4], [20, 0, 0]] as const

  it("inkPath makes a closed tapered ribbon around the centreline", () => {
    const d = inkPath(pts)
    expect(d.startsWith("M")).toBe(true)
    expect(d.endsWith("Z")).toBe(true)
    // widest point (10, 0) with w=4 → ribbon edges at y=±2
    expect(d).toMatch(/[ML]10 2[LZ]/)
    expect(d).toMatch(/[ML]10 -2[LZ]/)
  })

  it("closed shapes become an evenodd ring (two subpaths)", () => {
    expect(inkPath([[0, 0, 2], [10, 0, 2], [10, 10, 2], [0, 10, 2]], true).match(/Z/g)).toHaveLength(2)
  })

  it("fillPath passes through the control points", () => {
    expect(fillPath(pts, false)).toMatch(/^M0 0L/)
    expect(fillPath(pts, false)).toMatch(/L20 0$/)
  })
})

describe("halloween art", () => {
  const html = Object.fromEntries(
    Object.entries(MASCOTS).map(([name, C]) => [name, renderToStaticMarkup(<C />)])
  )

  it.each(Object.keys(MASCOTS))("%s renders a well-formed svg", (name) => {
    const out = html[name]
    expect(out.startsWith("<svg")).toBe(true)
    expect(out).not.toMatch(/NaN|undefined/)
  })

  it("every character has blinking eyes with highlights and an ink + paint layer", () => {
    for (const name of ["Ghost", "Pumpkin", "Bat", "Cobweb", ...CAST]) {
      expect(html[name]).toContain('class="blink"')
      expect(html[name]).toContain('class="paint"')
      expect(html[name]).toContain('class="ink"')
      expect(html[name].match(/fill="#fff"/g)!.length).toBeGreaterThanOrEqual(4)
    }
  })

  it("ink is wobbled, paint is grained + misregistered", () => {
    expect(html.Pumpkin).toContain('filter="url(#hw-wobble)"')
    expect(html.Pumpkin).toContain('filter="url(#hw-grain)"')
    expect(html.Pumpkin).toMatch(/class="paint" transform="translate\(1\.2 0\.9\)"/)
  })

  it("the ghost has two hem frames", () => {
    expect(html.Ghost.match(/class="hemA"/g)).toHaveLength(2)
    expect(html.Ghost.match(/class="hemB"/g)).toHaveLength(2)
  })

  it("the new cast shades with two tones, screentone and hatch, and the frame-swappers have two frames", () => {
    for (const name of CAST) {
      expect(html[name]).toContain('fill="url(#hw-tone)"')
      expect(html[name]).toContain('fill="url(#hw-hatch)"')
    }
    for (const name of ["Witch", "Mummy"]) {
      expect(html[name].match(/class="fA"/g)!.length).toBeGreaterThanOrEqual(2)
      expect(html[name].match(/class="fB"/g)!.length).toBeGreaterThanOrEqual(2)
    }
    expect(html.Skeleton).toContain('fill="#ff2e63"') // the SC chest print
  })

  it("the defs provide the filters and patterns the art references", () => {
    const defs = renderToStaticMarkup(<InkDefs />)
    for (const id of ["hw-wobble", "hw-grain", "hw-tone", "hw-hatch"]) expect(defs).toContain(`id="${id}"`)
  })

  // HALLOWEEN_PREVIEW_OUT=/path/preview.html npx jest themes/halloween/art
  // writes a standalone page of all the mascots (with the module CSS inlined,
  // so the stepped animations run) for eyeballing in a browser.
  it("optionally writes a preview page", () => {
    const out = process.env.HALLOWEEN_PREVIEW_OUT
    if (!out) return
    const css = readFileSync(require.resolve("./halloween.module.css"), "utf8")
    const tile = (name: string, w: number, dark = false) =>
      `<figure style="margin:0;padding:24px;background:${dark ? "#2d1b4e" : "#eee"};display:flex;flex-direction:column;align-items:center;gap:12px">
         <div style="width:${w}px">${html[name]}</div>
         <figcaption style="font:600 13px system-ui;color:${dark ? "#fff" : "#1a1a2e"}">${name}</figcaption>
       </figure>`
    writeFileSync(
      out,
      `<!doctype html><meta charset="utf-8"><title>Halloween mascots</title>
       <style>${css}
         body{margin:0;background:#fff;font-family:system-ui}
         .grid{display:grid;grid-template-columns:1fr}
         .grid svg{width:100%;height:auto;overflow:visible}
       </style>
       ${renderToStaticMarkup(<InkDefs />)}
       <div class="grid">
         ${Object.keys(MASCOTS).map((n) => tile(n, n === "Skyline" ? 680 : 360, n === "Cobweb")).join("")}
       </div>`
    )
    expect(true).toBe(true)
  })
})
