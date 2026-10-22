import { svgHasLiveText } from "./svg-live-text"

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`

describe("svgHasLiveText", () => {
  it("flags plain <text>", () => {
    expect(svgHasLiveText(wrap(`<text x="0" y="10" font-family="Futura">ALS Cranes</text>`))).toBe(true)
  })

  it("flags text held in <tspan>s (Illustrator export)", () => {
    expect(
      svgHasLiveText(wrap(`<text transform="matrix(1 0 0 1 10 20)"><tspan x="0" y="0">CRANE</tspan></text>`))
    ).toBe(true)
  })

  it("flags namespaced svg:text", () => {
    expect(svgHasLiveText(`<svg:svg><svg:text>Hi</svg:text></svg:svg>`)).toBe(true)
  })

  it("ignores outlined artwork (paths only)", () => {
    expect(svgHasLiveText(wrap(`<path d="M0 0L10 10Z"/><g><path d="M1 1"/></g>`))).toBe(false)
  })

  it("ignores empty / whitespace-only text", () => {
    expect(svgHasLiveText(wrap(`<text x="0"> </text><text><tspan>&#160;</tspan></text><text/>`))).toBe(false)
  })

  it("ignores text inside defs, metadata, title and comments", () => {
    expect(
      svgHasLiveText(
        wrap(
          `<title>Logo</title><metadata><text>meta</text></metadata><defs><text id="t">ref</text></defs><!-- <text>old</text> --><path d="M0 0"/>`
        )
      )
    ).toBe(false)
  })
})
