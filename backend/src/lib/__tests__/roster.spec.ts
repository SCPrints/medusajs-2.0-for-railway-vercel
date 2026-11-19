import {
  ORDER_ROSTER_MAX_PEOPLE,
  cleanRosterMember,
  compactOrderRoster,
  garmentGroupFor,
  packingLabelRows,
  teamOrderFromMetadata,
} from "../roster"

describe("garmentGroupFor", () => {
  it("sorts garments into size slots", () => {
    expect(garmentGroupFor("T-Shirts Staple Tee")).toBe("tops")
    expect(garmentGroupFor("Short Sleeve Polo")).toBe("tops")
    expect(garmentGroupFor("Stadium Shorts")).toBe("bottoms")
    expect(garmentGroupFor("Track Pants")).toBe("bottoms")
    expect(garmentGroupFor("Caps Trucker Cap")).toBe("headwear")
    expect(garmentGroupFor("Cuff Beanie")).toBe("headwear")
    expect(garmentGroupFor("Carrie Tote Bag")).toBeNull()
  })
})

describe("cleanRosterMember", () => {
  it("needs a name and keeps only known size slots", () => {
    expect(cleanRosterMember({ name: "  " })).toBeNull()
    expect(
      cleanRosterMember({ name: " Jo  Steele ", unit: "A Coy", number: 7, sizes: { tops: " L ", shoes: "10" } })
    ).toEqual({ name: "Jo Steele", unit: "A Coy", number: "7", sizes: { tops: "L" }, notes: null, is_active: true })
  })
})

describe("compactOrderRoster", () => {
  it("returns null for nobody and caps a huge list", () => {
    expect(compactOrderRoster([])).toBeNull()
    expect(compactOrderRoster("junk")).toBeNull()
    const many = Array.from({ length: ORDER_ROSTER_MAX_PEOPLE + 5 }, (_, i) => ({ name: `P${i}` }))
    const out = compactOrderRoster(many)!
    expect(out.people).toHaveLength(ORDER_ROSTER_MAX_PEOPLE)
    expect(out.total).toBe(ORDER_ROSTER_MAX_PEOPLE + 5)
    expect(out.truncated).toBe(true)
  })

  it("re-cleans a roster read back from cart metadata", () => {
    const out = compactOrderRoster({ people: [{ name: "Al", sizes: { tops: "M" }, evil: "<script>" }, { name: "" }] })
    expect(out).toEqual({ people: [{ name: "Al", unit: null, number: null, sizes: { tops: "M" } }], total: 1, truncated: false })
  })
})

describe("teamOrderFromMetadata", () => {
  it("drops unknown packing and per-person packing without people", () => {
    expect(teamOrderFromMetadata({ packing: "gift-wrapped" }).packing).toBeNull()
    expect(teamOrderFromMetadata({ packing: "individual" }).packing).toBe("bulk")
    const t = teamOrderFromMetadata({
      packing: "individual",
      roster: { people: [{ name: "Al" }] },
      personalisation_requested: "yes",
      organisation_id: "org_1",
    })
    expect(t.packing).toBe("individual")
    expect(t.personalisation_requested).toBe(false)
    expect(t.organisation_id).toBe("org_1")
  })
})

describe("packingLabelRows", () => {
  const roster = compactOrderRoster([
    { name: "Zed", unit: "B", sizes: { tops: "S" } },
    { name: "Amy", unit: "B", sizes: { tops: "XL" } },
    { name: "Bob", unit: "A", number: "9", sizes: { tops: "M", headwear: "OSFA" } },
  ])
  it("sorts by unit then name for per-person packing", () => {
    expect(packingLabelRows(roster, "individual").map((r) => r[0])).toEqual(["Bob", "Amy", "Zed"])
  })
  it("sorts by size for by_size and keeps entry order for bulk", () => {
    expect(packingLabelRows(roster, "by_size").map((r) => r[0])).toEqual(["Zed", "Bob", "Amy"])
    expect(packingLabelRows(roster, "bulk")[2]).toEqual(["Bob", "A", "9", "M", "", "OSFA"])
  })
})
