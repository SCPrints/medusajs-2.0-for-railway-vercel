import { buildProofImages } from "../proof-email"

/**
 * The Jobs board shows buildProofImages' pictures. These are the two shapes
 * that showed wrong on the board (orders #124 and #127, 10 Nov 2026).
 */
const line = (id: string, product: string, variant: string, group: string, front: string, back: string) => ({
  id,
  product_id: product,
  variant_title: variant,
  metadata: { customizerDesign: { group_id: group, artifacts: [{ side: "front", mockupUrl: front }, { side: "back", mockupUrl: back }] } },
})
const urls = (order: any) => (buildProofImages(order).mockupImages ?? []).map((m) => m.url)

describe("board mockups", () => {
  it("two garments, a revised proof on one size line each: revised pair per garment, no originals", () => {
    const order = {
      items: [
        line("polo-s", "polo", "Black/Orange / S", "gp", "https://x/polo-f.jpg", "https://x/polo-b.jpg"),
        line("polo-l", "polo", "Black/Orange / L", "gp", "https://x/polo-f.jpg", "https://x/polo-b.jpg"),
        line("tee-s", "tee", "BLACK / S", "gt", "https://x/tee-f.jpg", "https://x/tee-b.jpg"),
        line("tee-l", "tee", "BLACK / L", "gt", "https://x/tee-f.jpg", "https://x/tee-b.jpg"),
      ],
      metadata: {
        revised_proofs: [
          { line_item_id: "tee-l", side: "front", url: "https://x/tee-f2.jpg", uploaded_at: "2026-11-09T00:23:00Z" },
          { line_item_id: "tee-l", side: "back", url: "https://x/tee-b2.jpg", uploaded_at: "2026-11-09T00:24:00Z" },
          { line_item_id: "polo-s", side: "front", url: "https://x/polo-f2.jpg", uploaded_at: "2026-11-09T00:24:30Z" },
          { line_item_id: "polo-s", side: "back", url: "https://x/polo-b2.jpg", uploaded_at: "2026-11-09T00:25:00Z" },
        ],
      },
    }
    expect(urls(order)).toEqual(["https://x/polo-f2.jpg", "https://x/polo-b2.jpg", "https://x/tee-f2.jpg", "https://x/tee-b2.jpg"])
  })

  it("three sizes of one design, back revised on one line: one front, one (revised) back", () => {
    const order = {
      items: ["L", "M", "XS"].map((s) => line(`t-${s}`, "tee", `Black Snow Wash / ${s}`, "g", "https://x/f.jpg", "https://x/b.jpg")),
      metadata: { revised_proofs: [{ line_item_id: "t-XS", side: "back", url: "https://x/b2.jpg", uploaded_at: "2026-11-09T04:30:00Z" }] },
    }
    expect(urls(order)).toEqual(["https://x/f.jpg", "https://x/b2.jpg"])
  })
})
