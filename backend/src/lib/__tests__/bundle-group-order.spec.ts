import { rosterToBundleLines, validateParticipantSizes, type BundleGroupItem } from "../bundle-group-order"

const tee: BundleGroupItem = {
  bundle_item_id: "tee",
  label: "Tee",
  quantity_per_unit: 2,
  product_handle: "as-colour-staple-tee-5001",
  product_title: "Staple Tee",
  thumbnail: null,
  color: "Black",
  sizes: ["M", "L"],
  variantBySize: new Map([
    ["M", "v_tee_m"],
    ["L", "v_tee_l"],
  ]),
  defaultVariantId: null,
}
const cap: BundleGroupItem = {
  ...tee,
  bundle_item_id: "cap",
  label: "Cap",
  quantity_per_unit: 1,
  sizes: [],
  variantBySize: new Map(),
  defaultVariantId: "v_cap",
}

describe("bundle-group-order", () => {
  it("aggregates every participant's pack into per-variant lines", () => {
    const { items, skipped } = rosterToBundleLines(
      [tee, cap],
      [
        { id: "p1", name: "Ann", quantity: 1, bundle_sizes: { sizes: { tee: "M" } } },
        { id: "p2", name: "Bo", quantity: 2, bundle_sizes: { sizes: { tee: "M" } } },
        { id: "p3", name: "Cy", quantity: 1, bundle_sizes: { sizes: { tee: "L" } } },
      ]
    )
    expect(skipped).toEqual([])
    expect(items).toEqual([
      {
        bundle_item_id: "tee",
        product_handle: "as-colour-staple-tee-5001",
        lines: [
          { variant_id: "v_tee_m", quantity: 6 },
          { variant_id: "v_tee_l", quantity: 2 },
        ],
      },
      { bundle_item_id: "cap", product_handle: "as-colour-staple-tee-5001", lines: [{ variant_id: "v_cap", quantity: 4 }] },
    ])
  })

  it("skips a participant with a missing size instead of ordering half a pack", () => {
    const { items, skipped } = rosterToBundleLines([tee, cap], [{ id: "p1", name: "Ann", quantity: 1, bundle_sizes: null }])
    expect(items).toEqual([])
    expect(skipped[0].reason).toMatch(/Tee/)
  })

  it("rejects sizes that aren't available in the chosen colour", () => {
    expect(validateParticipantSizes([tee, cap], { tee: "L" })).toEqual({ tee: "L" })
    expect(() => validateParticipantSizes([tee], { tee: "XXL" })).toThrow(/Tee/)
  })
})
