import { dropStaleTeamCartMetadata } from "../team-cart-metadata"

const team = { roster: { total: 3 }, packing: "bulk", personalisation_requested: true, names_numbers: { names: "a4" } }

describe("dropStaleTeamCartMetadata", () => {
  it("drops home-delivery addresses once the postage line is gone", () => {
    const out = dropStaleTeamCartMetadata({ home_delivery: [{ name: "A" }], po_number: "PO1" }, [{ metadata: {} }])
    expect(out).toEqual({ po_number: "PO1" })
  })

  it("keeps them while the postage line is there", () => {
    const meta = { home_delivery: [{ name: "A" }] }
    expect(dropStaleTeamCartMetadata(meta, [{ metadata: { home_delivery_postage: true, home_delivery: true } }])).toBeNull()
  })

  it("drops people list, packing and names when no organisation line is left", () => {
    const out = dropStaleTeamCartMetadata({ ...team, organisation_id: "org_1" }, [{ metadata: { product_handle: "tee" } }])
    expect(out).toEqual({ organisation_id: "org_1" })
  })

  it("keeps team notes while range lines are in the cart", () => {
    expect(dropStaleTeamCartMetadata(team, [{ metadata: { organisation_id: "org_1" } }])).toBeNull()
  })

  it("returns null when there is nothing to drop", () => {
    expect(dropStaleTeamCartMetadata({ po_number: "x" }, [])).toBeNull()
    expect(dropStaleTeamCartMetadata(null, [])).toBeNull()
  })
})
