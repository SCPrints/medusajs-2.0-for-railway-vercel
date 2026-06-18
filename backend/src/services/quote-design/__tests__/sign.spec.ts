import { signQuoteAccept } from "../../quote-accept/sign"
import { signQuoteDesign, verifyQuoteDesign } from "../sign"

describe("quote-design sign", () => {
  const id = "qt_01HZX9ABCDEF"

  it("is deterministic and 24 hex chars", () => {
    const a = signQuoteDesign(id)
    const b = signQuoteDesign(id)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{24}$/)
  })

  it("verifies its own signature", () => {
    expect(verifyQuoteDesign(id, signQuoteDesign(id))).toBe(true)
  })

  it("rejects an empty / malformed / wrong-length signature", () => {
    expect(verifyQuoteDesign(id, "")).toBe(false)
    expect(verifyQuoteDesign(id, "deadbeef")).toBe(false)
    expect(verifyQuoteDesign(id, signQuoteDesign(id) + "00")).toBe(false)
    expect(verifyQuoteDesign("", signQuoteDesign(id))).toBe(false)
  })

  it("is bound to the quote id (a sig for another quote fails)", () => {
    expect(verifyQuoteDesign(id, signQuoteDesign("qt_OTHER"))).toBe(false)
  })

  it("is cross-purpose isolated from the accept signer (different message prefix)", () => {
    // A leaked accept-link signature must NOT authorise design writes, and a
    // design token must NOT pass as an accept signature.
    expect(signQuoteDesign(id)).not.toBe(signQuoteAccept(id))
    expect(verifyQuoteDesign(id, signQuoteAccept(id))).toBe(false)
  })
})
