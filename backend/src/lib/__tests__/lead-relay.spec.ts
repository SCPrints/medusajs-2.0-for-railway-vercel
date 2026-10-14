import { readLeadRelay } from "../lead-relay"

const req = (headers: Record<string, string>) => ({ headers })

describe("readLeadRelay", () => {
  const prev = process.env.REVALIDATE_SECRET
  afterEach(() => {
    process.env.REVALIDATE_SECRET = prev
  })

  it("rejects direct posts and wrong secrets when a secret is set", () => {
    process.env.REVALIDATE_SECRET = "s3cret"
    expect(readLeadRelay(req({ "user-agent": "node" })).ok).toBe(false)
    expect(readLeadRelay(req({ "x-scp-relay": "nope" })).ok).toBe(false)
  })

  it("trusts the relay's forwarded visitor details only when the secret matches", () => {
    process.env.REVALIDATE_SECRET = "s3cret"
    const r = readLeadRelay(
      req({
        "x-scp-relay": "s3cret",
        "x-scp-client-ip": "1.2.3.4",
        "x-scp-client-ua": "Mozilla/5.0",
        "x-scp-bot": "1",
        "user-agent": "node",
      })
    )
    expect(r).toEqual({ ok: true, clientIp: "1.2.3.4", userAgent: "Mozilla/5.0", bot: true })
  })

  it("is open (local dev) when no secret is configured", () => {
    delete process.env.REVALIDATE_SECRET
    const r = readLeadRelay(req({ "x-scp-client-ip": "9.9.9.9", "x-forwarded-for": "5.6.7.8, 10.0.0.1", "user-agent": "curl" }))
    expect(r.ok).toBe(true)
    expect(r.clientIp).toBe("9.9.9.9")
  })
})
