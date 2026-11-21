jest.mock("../constants", () => ({ NPS_LINK_SECRET: "test-secret" }))

import {
  countSend,
  isEmailVerified,
  markVerified,
  signEmailVerification,
  verifyEmailVerification,
} from "../email-verification"

describe("email-verification", () => {
  it("only an explicit flag makes an account unverified", () => {
    expect(isEmailVerified({ metadata: {} })).toBe(true)
    expect(isEmailVerified({ metadata: null })).toBe(true)
    expect(isEmailVerified({ metadata: { email_verification_required: true } })).toBe(false)
    expect(isEmailVerified({ metadata: markVerified({ email_verification_required: true }) })).toBe(true)
  })

  it("signs, verifies, rejects tampering and expiry", () => {
    const now = new Date("2026-11-22T00:00:00Z")
    const s = signEmailVerification("Bob@Example.com", now)
    expect(verifyEmailVerification(s, now)).toEqual({ ok: true, email: "bob@example.com" })
    expect(verifyEmailVerification({ ...s, email: "eve@example.com" }, now)).toEqual({ ok: false, reason: "bad_sig" })
    expect(verifyEmailVerification(s, new Date("2026-12-01T00:00:00Z"))).toEqual({ ok: false, reason: "expired" })
  })

  it("allows 3 sends a day, then resets next day", () => {
    const d = new Date("2026-11-22T01:00:00Z")
    let m: any = {}
    for (let i = 0; i < 3; i++) m = countSend(m, d)
    expect(countSend(m, d)).toBeNull()
    expect(countSend(m, new Date("2026-11-23T01:00:00Z"))).not.toBeNull()
  })
})
