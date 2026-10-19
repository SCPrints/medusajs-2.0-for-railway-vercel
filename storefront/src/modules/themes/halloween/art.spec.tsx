/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server"
import { writeFileSync } from "node:fs"

import { Bat, Cloud, Cobweb, Ghost, Moon, Pumpkin, Skyline } from "./art"

// CSS modules aren't transformed by the jest config; echo class names back.
jest.mock("./halloween.module.css", () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, k) => String(k) }),
}))

const MASCOTS = { Ghost, Pumpkin, Bat, Moon, Cloud, Skyline, Cobweb }

describe("halloween art", () => {
  const html = Object.fromEntries(
    Object.entries(MASCOTS).map(([name, C]) => [name, renderToStaticMarkup(<C />)])
  )

  it.each(Object.keys(MASCOTS))("%s renders a well-formed svg", (name) => {
    const out = html[name]
    expect(out.startsWith("<svg")).toBe(true)
    expect(out).not.toMatch(/NaN|undefined/)
  })

  it("every face has blinking eyes with highlights", () => {
    for (const name of ["Ghost", "Pumpkin", "Bat", "Cobweb"]) {
      expect(html[name]).toContain('class="blink"')
      // two eyes → two white highlight dots
      expect(html[name].match(/fill="#fff"/g)!.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("mirrored bat wing keeps its SVG transform outside the animated group", () => {
    expect(html.Bat).toMatch(/<g transform="translate\(96 0\) scale\(-1 1\)"><g class="wingR">/)
  })

  // HALLOWEEN_PREVIEW_OUT=/path/preview.html pnpm test -- art.spec
  // writes a standalone page of all the mascots (with the module CSS inlined,
  // so the animations run) for eyeballing in a browser.
  it("optionally writes a preview page", () => {
    const out = process.env.HALLOWEEN_PREVIEW_OUT
    if (!out) return
    const css = require("node:fs").readFileSync(
      require.resolve("./halloween.module.css"),
      "utf8"
    )
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
       <div class="grid">
         ${tile("Ghost", 150)}${tile("Pumpkin", 220)}${tile("Bat", 220)}${tile("Moon", 150)}
         ${tile("Cloud", 220)}${tile("Skyline", 340)}${tile("Cobweb", 220, true)}
       </div>`
    )
    expect(true).toBe(true)
  })
})
