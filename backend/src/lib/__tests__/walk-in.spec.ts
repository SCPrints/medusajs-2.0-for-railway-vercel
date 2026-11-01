import { EmailTemplates } from "../../modules/email-notifications/templates"
import { blockedForWalkIn } from "../../modules/email-notifications/services/resend"
import { isWalkInEmail } from "../walk-in"

describe("isWalkInEmail", () => {
  it("matches the walk-in inbox in any case, and nothing else", () => {
    expect(isWalkInEmail("WalkIn@scprints.com.au")).toBe(true)
    expect(isWalkInEmail("pat@club.org")).toBe(false)
    expect(isWalkInEmail(null)).toBe(false)
  })
})

describe("blockedForWalkIn", () => {
  const walkIn = "walkin@scprints.com.au"

  it("stops progress and marketing mail to the walk-in inbox", () => {
    expect(blockedForWalkIn(walkIn, EmailTemplates.ORDER_PRODUCTION_STAGE)).toBe(true)
    expect(blockedForWalkIn(walkIn, EmailTemplates.ARTWORK_APPROVAL)).toBe(true)
    expect(blockedForWalkIn(walkIn, EmailTemplates.NPS_REQUEST)).toBe(true)
  })

  it("keeps the sale's record, and everyone else's mail", () => {
    expect(blockedForWalkIn(walkIn, EmailTemplates.ORDER_PLACED)).toBe(false)
    expect(blockedForWalkIn(walkIn, EmailTemplates.TAX_INVOICE)).toBe(false)
    expect(blockedForWalkIn("pat@club.org", EmailTemplates.NPS_REQUEST)).toBe(false)
  })
})
