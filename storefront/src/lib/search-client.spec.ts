import { getProductIndexName, resetProductIndexNameCache } from "./search-client"

const ok = (products: string) =>
  ({ ok: true, json: async () => ({ products }) }) as unknown as Response
const fail = () => Promise.reject(new Error("timeout"))

describe("getProductIndexName", () => {
  const fetchMock = jest.fn()

  beforeAll(() => {
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "https://api.test"
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
    global.fetch = fetchMock as unknown as typeof fetch
  })

  beforeEach(() => {
    fetchMock.mockReset()
    resetProductIndexNameCache()
    jest.useRealTimers()
  })

  it("returns the live index name", async () => {
    fetchMock.mockResolvedValueOnce(ok("products_v5"))
    expect(await getProductIndexName()).toBe("products_v5")
  })

  it("retries once when the lookup fails", async () => {
    fetchMock.mockImplementationOnce(fail).mockResolvedValueOnce(ok("products_v5"))
    expect(await getProductIndexName()).toBe("products_v5")
  })

  it("keeps the last good name when the backend stops answering, and does not cache the failure", async () => {
    jest.useFakeTimers({ now: 0 })
    fetchMock.mockResolvedValueOnce(ok("products_v5"))
    await getProductIndexName()

    jest.setSystemTime(61_000) // past the 60 s cache
    fetchMock.mockImplementation(fail)
    expect(await getProductIndexName()).toBe("products_v5")

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(ok("products_v6"))
    expect(await getProductIndexName()).toBe("products_v6")
  })

  it("falls back to the bare name only when nothing has ever worked", async () => {
    fetchMock.mockImplementation(fail)
    expect(await getProductIndexName()).toBe("products")
  })
})
