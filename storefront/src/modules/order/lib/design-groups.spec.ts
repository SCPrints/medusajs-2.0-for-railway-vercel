import {
  artworkKey,
  groupOrderLinesByDesign,
  groupPastOrderDesigns,
  hasApprovedProof,
} from "./design-groups"

const line = (id: string, opts: { product?: string; files?: string[]; print?: string; qty?: number; studio?: boolean } = {}) =>
  ({
    id,
    product_id: opts.product ?? "prod_tee",
    product_handle: "tee",
    product_title: "Staple Tee",
    title: "Staple Tee",
    quantity: opts.qty ?? 1,
    thumbnail: null,
    metadata:
      opts.studio === false
        ? {}
        : {
            customizerDesign: {
              type: "fabric_customizer",
              customerOriginalFiles: (opts.files ?? []).map((url) => ({ url })),
              artifacts: [{ side: "front", printUrl: opts.print ?? "", mockupUrl: `${id}-mock.png` }],
            },
          },
  }) as any

describe("groupOrderLinesByDesign", () => {
  it("groups sizes of one design and skips non-studio lines", () => {
    const groups = groupOrderLinesByDesign([
      line("a", { files: ["logo.png"], print: "p1", qty: 3 }),
      line("b", { files: ["logo.png"], print: "p1", qty: 2 }),
      line("c", { files: ["other.png"], print: "p2" }),
      line("d", { studio: false }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].lines.map((l) => l.id)).toEqual(["a", "b"])
    expect(groups[0].totalQty).toBe(5)
  })
})

describe("artworkKey", () => {
  it("ignores render artifacts when original files exist", () => {
    expect(artworkKey(line("a", { files: ["x.png"], print: "p1" }))).toBe(
      artworkKey(line("b", { files: ["x.png"], print: "p2" }))
    )
  })
  it("keeps text-only designs apart", () => {
    expect(artworkKey(line("a", { print: "p1" }))).not.toBe(artworkKey(line("b", { print: "p2" })))
  })
})

describe("groupPastOrderDesigns", () => {
  it("rolls the same artwork across orders, newest order wins", () => {
    const designs = groupPastOrderDesigns([
      { id: "o1", display_id: 1, created_at: "2026-01-01", items: [line("a", { files: ["x.png"], print: "p1", qty: 10 })] },
      {
        id: "o3",
        display_id: 3,
        created_at: "2026-03-04",
        items: [
          line("c", { files: ["x.png"], print: "p3", qty: 5 }),
          line("d", { files: ["x.png"], print: "p3", qty: 5 }),
        ],
      },
      { id: "o2", display_id: 2, created_at: "2026-02-01", items: [line("b", { files: ["x.png"], print: "p2", qty: 20 })] },
    ])
    expect(designs).toHaveLength(1)
    expect(designs[0]).toMatchObject({
      orderCount: 3,
      totalQty: 40,
      lastOrderedAt: "2026-03-04",
      latestOrderId: "o3",
      latestLineIds: ["c", "d"],
      latestLineId: "c",
      mockupUrl: "c-mock.png",
    })
  })

  it("keeps the same artwork on different products separate", () => {
    const designs = groupPastOrderDesigns([
      {
        id: "o1",
        created_at: "2026-01-01",
        items: [line("a", { files: ["x.png"] }), line("b", { files: ["x.png"], product: "prod_hood" })],
      },
    ])
    expect(designs).toHaveLength(2)
  })
})

describe("hasApprovedProof", () => {
  it("needs a proof with a design for one of the lines", () => {
    expect(hasApprovedProof([{ line_item_id: "a", design: { objects: [] } }], ["a"])).toBe(true)
    expect(hasApprovedProof([{ line_item_id: "a", design: null }], ["a"])).toBe(false)
    expect(hasApprovedProof([{ line_item_id: "z", design: { objects: [] } }], ["a"])).toBe(false)
    expect(hasApprovedProof(undefined, ["a"])).toBe(false)
  })
})
