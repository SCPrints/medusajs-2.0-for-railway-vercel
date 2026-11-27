import { planGuestMembershipClaim } from "../org-guest-claim"

describe("planGuestMembershipClaim", () => {
  const m = (id: string, organisation_id: string, customer_id = "cus_guest") => ({ id, organisation_id, customer_id })

  it("moves every guest membership when the account has none", () => {
    expect(planGuestMembershipClaim([m("mem_1", "org_aaf"), m("mem_2", "org_b")], [])).toEqual([
      m("mem_1", "org_aaf"),
      m("mem_2", "org_b"),
    ])
  })

  it("skips an organisation the account already belongs to", () => {
    expect(planGuestMembershipClaim([m("mem_1", "org_aaf"), m("mem_2", "org_b")], ["org_aaf"])).toEqual([m("mem_2", "org_b")])
  })

  it("moves one membership per organisation when two guest records share it", () => {
    expect(planGuestMembershipClaim([m("mem_1", "org_aaf", "cus_g1"), m("mem_2", "org_aaf", "cus_g2")], [])).toEqual([
      m("mem_1", "org_aaf", "cus_g1"),
    ])
  })

  it("ignores rows without an id or organisation", () => {
    expect(planGuestMembershipClaim([m("", "org_aaf"), m("mem_2", "")], [])).toEqual([])
  })
})
