import { hasArtworkToApprove } from "../service"

const design = { id: "li_tee", metadata: { customizerDesign: { version: 2, artifacts: [] } } }
const freight = { id: "li_freight", metadata: { quote_locked_price: true } }
const bare = { id: "li_bare", metadata: null }

describe("hasArtworkToApprove", () => {
  it("true when any line in the group carries a customizerDesign", () => {
    expect(hasArtworkToApprove([freight, design], {})).toBe(true)
  })

  it("false for a service / freight line with no design and no proof (order #114 page 3)", () => {
    expect(hasArtworkToApprove([freight], {})).toBe(false)
    expect(hasArtworkToApprove([bare], undefined)).toBe(false)
  })

  it("true when staff uploaded a revised proof against a line in the group", () => {
    const meta = { revised_proofs: [{ line_item_id: "li_bare", side: "front", url: "http://x/p.jpg" }] }
    expect(hasArtworkToApprove([bare], meta)).toBe(true)
  })

  it("ignores revised proofs keyed to other lines", () => {
    const meta = { revised_proofs: [{ line_item_id: "li_other", side: "front", url: "http://x/p.jpg" }] }
    expect(hasArtworkToApprove([bare], meta)).toBe(false)
  })
})
