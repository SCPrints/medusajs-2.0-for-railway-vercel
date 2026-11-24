import { isBlockedHostname, isPrivateAddress, safeFetchBuffer } from "../safe-fetch"

describe("safe-fetch guards", () => {
  it("refuses private and internal addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "::1", "fdaa:76:db92::2", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    for (const host of ["localhost", "sc-prints-redis.internal", "x.flycast", "[::1]", "10.1.2.3"]) {
      expect(isBlockedHostname(host)).toBe(true)
    }
  })
  it("allows public addresses and hosts", () => {
    for (const ip of ["8.8.8.8", "104.18.1.1", "172.32.0.1", "2606:4700::1"]) expect(isPrivateAddress(ip)).toBe(false)
    expect(isBlockedHostname("pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev")).toBe(false)
  })
  it("never fetches http or internal URLs", async () => {
    const spy = jest.spyOn(global, "fetch")
    expect(await safeFetchBuffer("http://example.com/a.png", { maxBytes: 10, timeoutMs: 1000 })).toBeNull()
    expect(await safeFetchBuffer("https://sc-prints-redis.internal/", { maxBytes: 10, timeoutMs: 1000 })).toBeNull()
    expect(await safeFetchBuffer("https://169.254.169.254/latest", { maxBytes: 10, timeoutMs: 1000 })).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
