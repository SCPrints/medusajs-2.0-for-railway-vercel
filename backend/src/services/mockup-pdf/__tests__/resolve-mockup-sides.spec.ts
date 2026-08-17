import { resolveMockupSides } from "../service"

const meta = (proofs: unknown) => ({ revised_proofs: proofs })

describe("resolveMockupSides", () => {
  it("returns artifact sides untouched when no revised proofs exist", () => {
    const sides = [{ side: "front", mockupUrl: "http://a/front.jpg" }]
    expect(resolveMockupSides(sides, {}, ["li_1"])).toEqual(sides)
  })

  it("prefers a revised proof over the artifact mockup for the same side", () => {
    const sides = [{ side: "front", mockupUrl: "http://a/front.jpg" }]
    const out = resolveMockupSides(
      sides,
      meta([{ line_item_id: "li_1", side: "front", url: "http://r/rev.jpg", uploaded_at: "2026-01-01" }]),
      ["li_1"]
    )
    expect(out).toEqual([{ side: "front", mockupUrl: "http://r/rev.jpg" }])
  })

  it("appends a side that only exists as a revised proof (order-edit line with no design)", () => {
    const out = resolveMockupSides(
      [],
      meta([{ line_item_id: "li_new", side: "front", url: "http://r/rev.jpg", uploaded_at: "2026-01-01" }]),
      ["li_new"]
    )
    expect(out).toEqual([{ side: "front", mockupUrl: "http://r/rev.jpg" }])
  })

  it("ignores proofs keyed to lines outside the product group", () => {
    const sides = [{ side: "front", mockupUrl: "http://a/front.jpg" }]
    const out = resolveMockupSides(
      sides,
      meta([{ line_item_id: "li_other", side: "front", url: "http://r/rev.jpg", uploaded_at: "2026-01-01" }]),
      ["li_1"]
    )
    expect(out).toEqual(sides)
  })

  it("latest upload wins when multiple revisions exist for one side", () => {
    const out = resolveMockupSides(
      [{ side: "front", mockupUrl: "http://a/front.jpg" }],
      meta([
        { line_item_id: "li_1", side: "front", url: "http://r/old.jpg", uploaded_at: "2026-01-01" },
        { line_item_id: "li_1", side: "front", url: "http://r/new.jpg", uploaded_at: "2026-02-01" },
      ]),
      ["li_1"]
    )
    expect(out).toEqual([{ side: "front", mockupUrl: "http://r/new.jpg" }])
  })

  it("orders appended sides by canonical side order", () => {
    const out = resolveMockupSides(
      [{ side: "back", mockupUrl: "http://a/back.jpg" }],
      meta([{ line_item_id: "li_1", side: "front", url: "http://r/front.jpg", uploaded_at: "2026-01-01" }]),
      ["li_1"]
    )
    expect(out.map((s) => s.side)).toEqual(["front", "back"])
  })
})
