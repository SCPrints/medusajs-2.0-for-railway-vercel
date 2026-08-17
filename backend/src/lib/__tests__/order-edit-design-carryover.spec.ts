import {
  planDesignCarryover,
  rekeyLineScopedMetadata,
} from "../order-edit-design-carryover"

const item = (item_id: string, has_design: boolean) => ({ item_id, has_design })

describe("planDesignCarryover", () => {
  it("pairs a single removed designed line with a single added plain line", () => {
    const plan = planDesignCarryover(
      [item("li_polo", true), item("li_old", true)],
      [item("li_polo", true), item("li_new", false)]
    )
    expect(plan).toEqual({ from: "li_old", to: "li_new" })
  })

  it("returns null when nothing was removed (plain add)", () => {
    expect(
      planDesignCarryover(
        [item("li_polo", true)],
        [item("li_polo", true), item("li_new", false)]
      )
    ).toBeNull()
  })

  it("returns null when the removed line had no design", () => {
    expect(
      planDesignCarryover(
        [item("li_polo", true), item("li_plain", false)],
        [item("li_polo", true), item("li_new", false)]
      )
    ).toBeNull()
  })

  it("returns null when the added line already carries a design", () => {
    expect(
      planDesignCarryover(
        [item("li_old", true)],
        [item("li_new", true)]
      )
    ).toBeNull()
  })

  it("returns null on ambiguous multi-swap edits", () => {
    expect(
      planDesignCarryover(
        [item("li_a", true), item("li_b", true)],
        [item("li_c", false), item("li_d", false)]
      )
    ).toBeNull()
  })
})

describe("rekeyLineScopedMetadata", () => {
  it("re-keys revised_proofs rows and side-scoped override maps", () => {
    const out = rekeyLineScopedMetadata(
      {
        revised_proofs: [
          { id: "p1", line_item_id: "li_old", side: "front" },
          { id: "p2", line_item_id: "li_other", side: "front" },
        ],
        mockup_print_dimensions: { "li_old:front": "8x5cm", "li_other:back": "A4" },
        mockup_proof_notes: { li_old: "note", li_other: "keep" },
        unrelated: "untouched",
      },
      "li_old",
      "li_new"
    )
    expect(out).toEqual({
      revised_proofs: [
        { id: "p1", line_item_id: "li_new", side: "front" },
        { id: "p2", line_item_id: "li_other", side: "front" },
      ],
      mockup_print_dimensions: { "li_new:front": "8x5cm", "li_other:back": "A4" },
      mockup_proof_notes: { li_new: "note", li_other: "keep" },
    })
  })

  it("returns an empty object when nothing references the old line", () => {
    expect(
      rekeyLineScopedMetadata(
        { revised_proofs: [{ line_item_id: "li_other" }] },
        "li_old",
        "li_new"
      )
    ).toEqual({})
    expect(rekeyLineScopedMetadata(null, "a", "b")).toEqual({})
  })

  it("does not rename keys that merely share a prefix with the old id", () => {
    const out = rekeyLineScopedMetadata(
      { mockup_proof_notes: { li_old_2: "keep" }, mockup_print_dimensions: { "li_old_2:front": "keep" } },
      "li_old",
      "li_new"
    )
    expect(out).toEqual({})
  })
})
