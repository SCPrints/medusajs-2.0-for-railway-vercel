import { acceptCheck, hashInviteToken, inviteState, newInviteToken } from "../org-invites"

describe("org-invites", () => {
  it("stores only the hash of a random token", () => {
    const a = newInviteToken()
    expect(a.hash).toBe(hashInviteToken(a.token))
    expect(a.hash).not.toContain(a.token)
    expect(newInviteToken().token).not.toBe(a.token)
  })
  it("reads the state", () => {
    const now = new Date("2026-11-22T00:00:00Z")
    const future = new Date("2026-12-01T00:00:00Z")
    expect(inviteState({ expires_at: future }, now)).toBe("pending")
    expect(inviteState({ expires_at: new Date("2026-11-01T00:00:00Z") }, now)).toBe("expired")
    expect(inviteState({ expires_at: future, revoked_at: now }, now)).toBe("revoked")
    expect(inviteState({ expires_at: future, accepted_at: now, revoked_at: now }, now)).toBe("accepted")
  })
  it("needs the same, confirmed email", () => {
    expect(acceptCheck("A@b.com", { email: "a@b.com", verified: true })).toBe("ok")
    expect(acceptCheck("a@b.com", { email: "c@b.com", verified: true })).toBe("wrong_email")
    expect(acceptCheck("a@b.com", { email: "a@b.com", verified: false })).toBe("unverified")
  })
})
