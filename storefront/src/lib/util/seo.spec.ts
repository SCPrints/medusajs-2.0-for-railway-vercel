import { metaDescription, SEO } from "./seo"

describe("metaDescription", () => {
  it("falls back when there's no usable copy", () => {
    expect(metaDescription("")).toBe(SEO.siteDescription)
    expect(metaDescription(null)).toBe(SEO.siteDescription)
    expect(metaDescription("   ", "custom")).toBe("custom")
    expect(metaDescription("<p></p>", "custom")).toBe("custom")
  })

  it("strips HTML and collapses whitespace", () => {
    expect(metaDescription("<p>Soft  <b>cotton</b>\n tee</p>")).toBe("Soft cotton tee")
  })

  it("passes short copy through untouched", () => {
    const short = "A heavyweight 320gsm hoodie, perfect for team kits."
    expect(metaDescription(short)).toBe(short)
  })

  it("truncates long copy to <=156 chars on a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim() // 300 chars, all spaces
    const out = metaDescription(long)
    expect(out.length).toBeLessThanOrEqual(156)
    expect(out.endsWith("…")).toBe(true)
    expect(out).not.toMatch(/\s…$/) // no dangling space before ellipsis
    expect(out.slice(0, -1).split(" ").pop()).toBe("word") // didn't cut mid-word
  })
})
