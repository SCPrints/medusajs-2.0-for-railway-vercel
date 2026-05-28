import { AusPostClient } from "../client"

/**
 * Smoke tests for the v1 (HTTP Basic Auth) client's auth + error handling.
 *
 * Mocks global fetch so the tests run offline with no AusPost creds.
 * Heavier integration tests against the testbed should live elsewhere
 * (gated on AUSPOST_API_KEY being set).
 */

const baseOptions = {
  api_key: "fake-key-uuid",
  api_password: "fake-password",
  account_number: "1234567890",
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

const expectedBasicHeader =
  "Basic " + Buffer.from("fake-key-uuid:fake-password").toString("base64")

describe("AusPostClient (v1, Basic Auth)", () => {
  afterEach(() => {
    delete (global as any).fetch
  })

  describe("authentication", () => {
    it("sends Basic Auth + Account-Number on every call, with no token round-trip", async () => {
      const { calls } = installFetchMock(() => ({ json: { tracking_results: [] } }))

      const client = new AusPostClient(baseOptions)
      await client.getTracking(["AB1"])

      // No OAuth token endpoint should ever be hit.
      expect(calls.some((c) => c.url.includes("/oauth/"))).toBe(false)
      expect(calls).toHaveLength(1)

      const headers = (calls[0].init?.headers || {}) as Record<string, string>
      expect(headers.Authorization).toBe(expectedBasicHeader)
      expect(headers["Account-Number"]).toBe("1234567890")
    })
  })

  describe("base URL switching", () => {
    it("uses the v1 testbed URL when test_mode is true", async () => {
      const { calls } = installFetchMock(() => ({ json: { tracking_results: [] } }))
      const client = new AusPostClient({ ...baseOptions, test_mode: true })
      await client.getTracking(["AB1"])
      expect(calls[0].url).toContain("/test/shipping/v1")
    })

    it("uses the v1 prod URL when test_mode is false", async () => {
      const { calls } = installFetchMock(() => ({ json: { tracking_results: [] } }))
      const client = new AusPostClient({ ...baseOptions, test_mode: false })
      await client.getTracking(["AB1"])
      expect(calls[0].url).toContain("digitalapi.auspost.com.au/shipping/v1")
      expect(calls[0].url).not.toContain("/test/")
    })
  })

  describe("getItemPrices", () => {
    it("POSTs to /prices/items and returns the parsed body", async () => {
      const { calls } = installFetchMock(() => ({
        json: {
          items: [
            {
              prices: [
                { product_id: "7E55", calculated_price: 9.05, calculated_gst: 0.9 },
              ],
            },
          ],
        },
      }))

      const client = new AusPostClient(baseOptions)
      const resp = await client.getItemPrices({
        from: { postcode: "2010" },
        to: { postcode: "3000" },
        items: [{ length: 35, width: 25, height: 10, weight: 0.5 }],
      })

      expect(calls[0].url).toContain("/prices/items")
      expect(calls[0].init?.method).toBe("POST")
      expect(resp.items?.[0]?.prices?.[0]?.product_id).toBe("7E55")
    })
  })

  describe("error surfacing", () => {
    it("propagates errors[] from a 200 response as a thrown MedusaError", async () => {
      installFetchMock(() => ({
        json: {
          errors: [
            { code: "44120", name: "Invalid postcode", message: "Invalid Postcode for destination address" },
          ],
        },
      }))

      const client = new AusPostClient(baseOptions)
      await expect(
        client.getItemPrices({
          from: { postcode: "2010" },
          to: { postcode: "999" },
          items: [{ length: 10, width: 10, height: 10, weight: 0.5 }],
        })
      ).rejects.toThrow(/Invalid Postcode/)
    })

    it("throws UNAUTHORIZED on a 401", async () => {
      installFetchMock(() => ({ status: 401, text: "Unauthorized" }))
      const client = new AusPostClient(baseOptions)
      await expect(client.getTracking(["AB1"])).rejects.toThrow(/failed \(401\)/)
    })

    it("rejects a track batch larger than 10 without hitting the network", async () => {
      const { fetchMock } = installFetchMock(() => ({ json: { tracking_results: [] } }))
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
    it("returns true when the account endpoint responds 2xx", async () => {
      const { calls } = installFetchMock(() => ({ json: { account_number: "1234567890" } }))
      const client = new AusPostClient(baseOptions)
      expect(await client.ping()).toBe(true)
      expect(calls[0].url).toContain("/accounts/1234567890")
    })

    it("returns false (does not throw) when the call fails", async () => {
      installFetchMock(() => ({ status: 500, text: "boom" }))
      const client = new AusPostClient(baseOptions)
      expect(await client.ping()).toBe(false)
    })
  })
})
