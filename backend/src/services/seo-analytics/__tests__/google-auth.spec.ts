const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

describe("buildGoogleJwt token-sharing cache", () => {
  const ORIGINAL = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  beforeAll(() => {
    // A structurally-valid SA key — the JWT constructor only stores these; it
    // never signs/authorizes in these tests, so a placeholder key is fine.
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----\n",
    })
    jest.resetModules()
  })

  afterAll(() => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = ORIGINAL
  })

  it("returns the SAME JWT instance for the same scopes (one token, shared)", () => {
    const { buildGoogleJwt } = require("../google-auth")
    expect(buildGoogleJwt([GSC_SCOPE])).toBe(buildGoogleJwt([GSC_SCOPE]))
  })

  it("is scope-order-insensitive", () => {
    const { buildGoogleJwt } = require("../google-auth")
    expect(buildGoogleJwt([GSC_SCOPE, GA4_SCOPE])).toBe(
      buildGoogleJwt([GA4_SCOPE, GSC_SCOPE])
    )
  })

  it("returns a DIFFERENT instance for different scopes", () => {
    const { buildGoogleJwt } = require("../google-auth")
    expect(buildGoogleJwt([GSC_SCOPE])).not.toBe(buildGoogleJwt([GA4_SCOPE]))
  })
})
