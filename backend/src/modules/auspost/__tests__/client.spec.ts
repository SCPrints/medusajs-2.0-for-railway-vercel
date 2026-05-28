import { AusPostClient } from "../client"

/**
 * Smoke tests for the client's auth + error-handling paths.
 *
 * Mocks global fetch so the tests run offline with no AusPost creds.
 * Heavier integration tests against the testbed should live elsewhere
 * (and are gated on AUSPOST_API_KEY being set).
 */

const baseOptions = {
  api_key: "fake-key",
  api_secret: "fake-secret",
  account_number: "1234567890",
  oauth_client_id: "fake-client-id",
  oauth_client_secret: "fake-client-secret",
  test_mode: true,
}

type FetchCall = { url: string; init?: RequestInit }

const installFetchMock = (
  handler: (call: FetchCall) => { status?: number; json?: any; text?: string }
) => {
  const calls: FetchCall[] = []
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const { status = 200, json, text } = handler({ url, init })
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-type" && json !== undefined
            ? "application/json"
            : null,
      },
      json: async () => json ?? {},
      text: async () => text ?? (json !== undefined ? JSON.stringify(json) : ""),
    } as unknown as Response
  })
  ;(global as any).fetch = fetchMock
  return { calls, fetchMock }
}

describe("AusPostClient", () => {
  afterEach(() => {
    delete (global as any).fetch
  })

  describe("OAuth token caching", () => {
    it("fetches a token once and reuses it across data calls", async () => {
      const { calls } = installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok-1", expires_in: 3600 } }
        }
        return { json: { tracking_results: [] } }
      })

      const client = new AusPostClient(baseOptions)
      await client.getTracking(["AB1"])
      await client.getTracking(["AB2"])

      const tokenCalls = calls.filter((c) => c.url.includes("/oauth/token"))
      expect(tokenCalls).toHaveLength(1)
    })

    it("re-fetches the token after invalidateToken()", async () => {
      const { calls } = installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok-1", expires_in: 3600 } }
        }
        return { json: { tracking_results: [] } }
      })

      const client = new AusPostClient(baseOptions)
      await client.getTracking(["AB1"])
      client.invalidateToken()
      await client.getTracking(["AB2"])

      const tokenCalls = calls.filter((c) => c.url.includes("/oauth/token"))
      expect(tokenCalls).toHaveLength(2)
    })

    it("attaches Bearer token + Account-Number header on every data call", async () => {
      const { calls } = installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok-1", expires_in: 3600 } }
        }
        return { json: { tracking_results: [] } }
      })

      const client = new AusPostClient(baseOptions)
      await client.getTracking(["AB1"])

      const dataCall = calls.find((c) => c.url.includes("/track"))
      const headers = (dataCall?.init?.headers || {}) as Record<string, string>
      expect(headers.Authorization).toBe("Bearer tok-1")
      expect(headers["Account-Number"]).toBe("1234567890")
    })

    it("throws UNAUTHORIZED on token endpoint failure", async () => {
      installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { status: 401, text: "invalid_client" }
        }
        return { json: {} }
      })

      const client = new AusPostClient(baseOptions)
      await expect(client.getTracking(["AB1"])).rejects.toThrow(/OAuth token request failed/)
    })
  })

  describe("base URL switching", () => {
    it("uses the testbed URL when test_mode is true", async () => {
      const { calls } = installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok", expires_in: 3600 } }
        }
        return { json: { tracking_results: [] } }
      })

      const client = new AusPostClient({ ...baseOptions, test_mode: true })
      await client.getTracking(["AB1"])

      const dataCall = calls.find((c) => c.url.includes("/track"))!
      expect(dataCall.url).toContain("/test/shipping/v2")
    })

    it("uses the prod URL when test_mode is false", async () => {
      const { calls } = installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok", expires_in: 3600 } }
        }
        return { json: { tracking_results: [] } }
      })

      const client = new AusPostClient({ ...baseOptions, test_mode: false })
      await client.getTracking(["AB1"])

      const dataCall = calls.find((c) => c.url.includes("/track"))!
      expect(dataCall.url).toContain("digitalapi.auspost.com.au/shipping/v2")
      expect(dataCall.url).not.toContain("/test/")
    })
  })

  describe("error surfacing", () => {
    it("propagates errors[] from a 200 response as a thrown MedusaError", async () => {
      installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok", expires_in: 3600 } }
        }
        return {
          json: {
            errors: [
              { code: "44120", message: "Invalid Postcode for destination address" },
            ],
          },
        }
      })

      const client = new AusPostClient(baseOptions)
      await expect(
        client.getPriceQuote({
          shipments: [
            {
              from: { postcode: "2010" },
              to: { postcode: "999" },
              items: [{ length: 10, width: 10, height: 10, weight: 0.5 }],
            },
          ],
        })
      ).rejects.toThrow(/Invalid Postcode/)
    })

    it("rejects a track batch larger than 10 without hitting the network", async () => {
      const { fetchMock } = installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok", expires_in: 3600 } }
        }
        return { json: { tracking_results: [] } }
      })

      const client = new AusPostClient(baseOptions)
      const tooMany = Array.from({ length: 11 }, (_, i) => `AB${i}`)
      await expect(client.getTracking(tooMany)).rejects.toThrow(/max 10 tracking IDs/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("short-circuits on empty tracking-ID array (no network call)", async () => {
      const { fetchMock } = installFetchMock(() => ({ json: {} }))
      const client = new AusPostClient(baseOptions)
      const resp = await client.getTracking([])
      expect(resp).toEqual({ tracking_results: [] })
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe("ping()", () => {
    it("returns true when OAuth succeeds", async () => {
      installFetchMock(({ url }) => {
        if (url.includes("/oauth/token")) {
          return { json: { access_token: "tok", expires_in: 3600 } }
        }
        return { json: {} }
      })
      const client = new AusPostClient(baseOptions)
      expect(await client.ping()).toBe(true)
    })

    it("returns false (does not throw) when OAuth fails", async () => {
      installFetchMock(() => ({ status: 500, text: "boom" }))
      const client = new AusPostClient(baseOptions)
      expect(await client.ping()).toBe(false)
    })
  })
})
