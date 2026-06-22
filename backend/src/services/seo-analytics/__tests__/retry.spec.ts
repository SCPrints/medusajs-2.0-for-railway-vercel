import { isTransientNetworkError, withTransientRetry } from "../retry"

describe("isTransientNetworkError", () => {
  it("treats the gaxios/undici 'Premature close' token error as transient", () => {
    const err = new Error(
      "Invalid response body while trying to fetch https://www.googleapis.com/oauth2/v4/token: Premature close"
    )
    expect(isTransientNetworkError(err)).toBe(true)
  })

  it("matches undici error codes and classic socket codes", () => {
    expect(isTransientNetworkError({ code: "UND_ERR_SOCKET" })).toBe(true)
    expect(isTransientNetworkError({ code: "ECONNRESET" })).toBe(true)
    expect(isTransientNetworkError({ code: "ETIMEDOUT" })).toBe(true)
  })

  it("retries 429 and 5xx responses", () => {
    expect(isTransientNetworkError({ status: 429 })).toBe(true)
    expect(isTransientNetworkError({ response: { status: 503 } })).toBe(true)
  })

  it("does NOT retry auth/config errors so they surface fast", () => {
    expect(isTransientNetworkError(new Error("invalid_grant"))).toBe(false)
    expect(isTransientNetworkError({ status: 401 })).toBe(false)
    expect(isTransientNetworkError({ status: 403 })).toBe(false)
    expect(
      isTransientNetworkError(new Error("unauthorized_client"))
    ).toBe(false)
  })
})

describe("withTransientRetry", () => {
  it("succeeds on a later attempt after a transient flake", async () => {
    let calls = 0
    const result = await withTransientRetry(
      async () => {
        calls++
        if (calls < 2) throw new Error("Premature close")
        return "ok"
      },
      { baseDelayMs: 0 }
    )
    expect(result).toBe("ok")
    expect(calls).toBe(2)
  })

  it("gives up after the configured attempts and rethrows", async () => {
    let calls = 0
    await expect(
      withTransientRetry(
        async () => {
          calls++
          throw new Error("Premature close")
        },
        { attempts: 3, baseDelayMs: 0 }
      )
    ).rejects.toThrow("Premature close")
    expect(calls).toBe(3)
  })

  it("does not retry a non-transient error", async () => {
    let calls = 0
    await expect(
      withTransientRetry(
        async () => {
          calls++
          throw new Error("invalid_grant")
        },
        { baseDelayMs: 0 }
      )
    ).rejects.toThrow("invalid_grant")
    expect(calls).toBe(1)
  })
})
