import { blockedForWalkIn } from "../../modules/email-notifications/services/resend"
import { draftCustomer } from "../../services/pos-checkout/checkout"
import { isWalkInEmail } from "../walk-in"

describe("isWalkInEmail", () => {
  it("matches the walk-in inbox in any case, and nothing else", () => {
    expect(isWalkInEmail("WalkIn@scprints.com.au")).toBe(true)
    expect(isWalkInEmail("pat@club.org")).toBe(false)
    expect(isWalkInEmail(null)).toBe(false)
  })
})

describe("blockedForWalkIn", () => {
  it("never sends anything to the walk-in placeholder", () => {
    expect(blockedForWalkIn("walkin@scprints.com.au")).toBe(true)
    expect(blockedForWalkIn("pat@club.org")).toBe(false)
  })
})

describe("draftCustomer", () => {
  it("uses the linked customer's real email over the walk-in placeholder", () => {
    expect(draftCustomer("cus_1", "walkin@scprints.com.au", "christine@lifegrain.com.au")).toEqual({
      customer_id: "cus_1",
      email: "christine@lifegrain.com.au",
      relinkTo: null,
    })
  })

  it("keeps an email-less customer on the walk-in placeholder and relinks after", () => {
    expect(draftCustomer("cus_1", "walkin@scprints.com.au", null)).toEqual({
      email: "walkin@scprints.com.au",
      relinkTo: "cus_1",
    })
  })
})
