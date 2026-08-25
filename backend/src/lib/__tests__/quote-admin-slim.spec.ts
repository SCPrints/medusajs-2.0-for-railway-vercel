import { slimQuoteForAdmin, slimQuoteLineForAdmin } from "../quote-admin-slim"

describe("slimQuoteLineForAdmin", () => {
  it("replaces a design object with true and lifts per-side mockup urls", () => {
    const line = {
      id: "a",
      title: "Tee",
      customizerDesign: {
        version: 2,
        sideLayouts: { front: [{ huge: "payload" }] },
        artifacts: [
          { side: "front", printUrl: "p1", mockupUrl: "https://x/front.jpg" },
          { side: "back", printUrl: "p2", mockupUrl: "https://x/back.jpg" },
          { side: "left_sleeve", printUrl: null, mockupUrl: null },
        ],
      },
    }
    const out = slimQuoteLineForAdmin(line)
    expect(out.customizerDesign).toBe(true)
    expect(out.mockup_urls).toEqual([
      { side: "front", url: "https://x/front.jpg" },
      { side: "back", url: "https://x/back.jpg" },
    ])
    // original untouched
    expect(typeof line.customizerDesign).toBe("object")
  })

  it("passes non-design lines through unchanged", () => {
    const line = { id: "b", title: "Screen setup", customizerDesign: null }
    expect(slimQuoteLineForAdmin(line)).toBe(line)
  })
})

describe("slimQuoteForAdmin", () => {
  it("slims every line and leaves quotes without items alone", () => {
    const quote = {
      id: "qt_1",
      line_items: {
        items: [
          { id: "a", title: "plain" },
          {
            id: "b",
            title: "design",
            customizerDesign: { artifacts: [{ side: "front", mockupUrl: "u" }] },
          },
        ],
      },
    }
    const out = slimQuoteForAdmin(quote)
    expect(out.line_items.items[0]).toEqual({ id: "a", title: "plain" })
    expect(out.line_items.items[1].customizerDesign).toBe(true)
    expect(slimQuoteForAdmin({ id: "x" } as any)).toEqual({ id: "x" })
  })
})
