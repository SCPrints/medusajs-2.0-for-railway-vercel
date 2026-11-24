import { designThumbnail, orgTier, rangeGroupsFromOrder } from "../org-range-from-order"

const line = (id: string, group: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  product_title: "Staple Tee",
  variant_title: "Black / M",
  variant_id: `var_${id}`,
  product_id: "prod_1",
  quantity: 2,
  metadata: { customizerDesign: { ...(group ? { group_id: group } : {}), artifacts: [] } },
  ...extra,
})

describe("rangeGroupsFromOrder", () => {
  it("makes one entry per design group, titled garment + colour", () => {
    const groups = rangeGroupsFromOrder([
      line("a", "g1"),
      line("b", "g1", { variant_title: "Black / L" }),
      line("c", "g2", { variant_title: "Navy / S" }),
    ])
    expect(groups.map((g) => [g.group_key, g.title, g.line.id])).toEqual([
      ["g1", "Staple Tee — Black", "a"],
      ["g2", "Staple Tee — Navy", "c"],
    ])
  })

  it("skips setup fees and lines with no Studio design; no group id → line id", () => {
    const groups = rangeGroupsFromOrder([
      line("a", null),
      { id: "fee", title: "Screen setup", metadata: { screen_setup_for_order: true } },
      { id: "plain", title: "Blank tee", variant_id: "v", metadata: {} },
    ])
    expect(groups.map((g) => g.group_key)).toEqual(["a"])
  })
})

describe("designThumbnail", () => {
  it("prefers the front mockup", () => {
    expect(
      designThumbnail({ artifacts: [{ side: "back", mockupUrl: "b.png" }, { side: "front", mockupUrl: "f.png" }] })
    ).toBe("f.png")
    expect(designThumbnail({ artifacts: [{ side: "back", mockupUrl: "b.png" }] })).toBe("b.png")
    expect(designThumbnail({})).toBeNull()
  })
})

describe("orgTier", () => {
  it("reads slug, group name or label; rejects junk", () => {
    expect(orgTier("silver")?.name).toBe("Tier: Silver")
    expect(orgTier("Tier: Silver")?.slug).toBe("silver")
    expect(orgTier("Silver Plus")?.slug).toBe("silver_plus")
    expect(orgTier("vip")).toBeNull()
    expect(orgTier(null)).toBeNull()
  })
})
