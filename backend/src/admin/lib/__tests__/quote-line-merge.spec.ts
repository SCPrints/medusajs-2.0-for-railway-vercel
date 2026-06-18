import { mergeServerRows, type MergeableLine } from "../quote-line-merge"

type Row = MergeableLine & {
  thumbnail?: string | null
  customizerDesign?: unknown | null
  variant_id?: string | null
}

const row = (over: Partial<Row> & { id: string }): Row => ({
  title: "",
  quantity: "",
  unit_price: "",
  description: "",
  group_id: null,
  ...over,
})

describe("mergeServerRows", () => {
  it("adopts a brand-new server row verbatim (e.g. a design that just landed)", () => {
    const prev = [row({ id: "a", title: "Local A" })]
    const server = [
      row({ id: "a", title: "Local A" }),
      row({ id: "b", title: "Hoodie — S", group_id: "g1", customizerDesign: { x: 1 } }),
    ]
    const out = mergeServerRows(prev, server)
    expect(out.map((r) => r.id)).toEqual(["a", "b"])
    expect(out[1].customizerDesign).toEqual({ x: 1 })
  })

  it("preserves the operator's unsaved editable fields on a row that exists in both", () => {
    // staff edited qty/price/description locally; a design then lands on the server
    const prev = [row({ id: "a", quantity: "50", unit_price: "23.38", description: "rush" })]
    const server = [
      row({ id: "a", quantity: "10", unit_price: "0", description: "", thumbnail: "t.png" }),
    ]
    const out = mergeServerRows(prev, server)
    expect(out).toHaveLength(1)
    // local editable fields win…
    expect(out[0].quantity).toBe("50")
    expect(out[0].unit_price).toBe("23.38")
    expect(out[0].description).toBe("rush")
    // …but server-owned design field is adopted
    expect(out[0].thumbnail).toBe("t.png")
  })

  it("does NOT duplicate a re-edited design group (fresh server ids, same group_id)", () => {
    // old group g1 = lines old1/old2; staff re-edit in Studio → server now has
    // new3/new4 under g1 (fresh ids).
    const prev = [
      row({ id: "old1", group_id: "g1", quantity: "10" }),
      row({ id: "old2", group_id: "g1", quantity: "12" }),
    ]
    const server = [
      row({ id: "new3", group_id: "g1", quantity: "10" }),
      row({ id: "new4", group_id: "g1", quantity: "12" }),
    ]
    const out = mergeServerRows(prev, server)
    // only the new server lines survive — no old1/old2 re-appended
    expect(out.map((r) => r.id).sort()).toEqual(["new3", "new4"])
  })

  it("keeps a genuinely local-only row (unsaved product/custom line, group_id null)", () => {
    const prev = [
      row({ id: "srv", group_id: "g1" }),
      row({ id: "local-product", variant_id: "var_1", group_id: null }),
    ]
    const server = [row({ id: "srv", group_id: "g1" })]
    const out = mergeServerRows(prev, server)
    expect(out.map((r) => r.id)).toEqual(["srv", "local-product"])
  })

  it("drops a stale local row whose group is now represented on the server", () => {
    // edge: a local row carries a group_id that the server's new set also uses
    // (its group was just replaced) — it must not linger as a duplicate.
    const prev = [row({ id: "stale", group_id: "g1" })]
    const server = [row({ id: "fresh", group_id: "g1" })]
    const out = mergeServerRows(prev, server)
    expect(out.map((r) => r.id)).toEqual(["fresh"])
  })
})
