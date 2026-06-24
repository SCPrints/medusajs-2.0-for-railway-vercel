/**
 * Guard against shipping a forgeable HMAC link secret to production.
 *
 * `LINK_SIGNING_SECRET_INSECURE` is computed once at import from the
 * environment, so each case re-imports the modules under a fresh env via
 * `jest.isolateModules`.
 */

const STRONG_SECRET = "a-strong-random-secret-9f8e7d6c5b4a3210"
const PLACEHOLDER = "nps-dev-secret-do-not-use-in-prod"
const QUOTE_ID = "qt_01HZX9ABCDEF"
const ORDER_ID = "order_01HZX9ABCDEF"

type Loaded = {
  insecure: boolean
  verifyQuoteDesign: (id: string, sig: string) => boolean
  signQuoteDesign: (id: string) => string
  verifyQuoteAccept: (id: string, sig: string) => boolean
  signQuoteAccept: (id: string) => string
  verifyArtworkApproval: (id: string, sig: string) => boolean
  signArtworkApproval: (id: string) => string
  verifyNpsRating: (id: string, score: number, sig: string) => boolean
  signNpsRating: (id: string, score: number) => string
}

const ORIGINAL_ENV = { ...process.env }

let errorSpy: jest.SpyInstance

beforeEach(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  errorSpy.mockRestore()
})

function loadWithEnv(env: Record<string, string | undefined>): Loaded {
  let out: Loaded | undefined
  jest.isolateModules(() => {
    process.env = { ...ORIGINAL_ENV }
    // Make sure deployment signals only come from `env`, not the host shell.
    delete process.env.FLY_APP_NAME
    delete process.env.NPS_LINK_SECRET
    delete process.env.BACKEND_PUBLIC_URL
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = v
      }
    }

    const constants = require("../constants")
    const qd = require("../../services/quote-design/sign")
    const qa = require("../../services/quote-accept/sign")
    const aa = require("../../services/artwork-approval/sign")
    const nps = require("../../services/nps-requests/sign")

    out = {
      insecure: constants.LINK_SIGNING_SECRET_INSECURE,
      verifyQuoteDesign: qd.verifyQuoteDesign,
      signQuoteDesign: qd.signQuoteDesign,
      verifyQuoteAccept: qa.verifyQuoteAccept,
      signQuoteAccept: qa.signQuoteAccept,
      verifyArtworkApproval: aa.verifyArtworkApproval,
      signArtworkApproval: aa.signArtworkApproval,
      verifyNpsRating: nps.verifyNpsRating,
      signNpsRating: nps.signNpsRating,
    }
  })
  return out as Loaded
}

describe("link-signing secret guard", () => {
  it("treats a real secret in production as secure (links verify normally)", () => {
    const m = loadWithEnv({
      NODE_ENV: "production",
      NPS_LINK_SECRET: STRONG_SECRET,
    })
    expect(m.insecure).toBe(false)
    expect(m.verifyQuoteDesign(QUOTE_ID, m.signQuoteDesign(QUOTE_ID))).toBe(true)
    expect(m.verifyQuoteAccept(QUOTE_ID, m.signQuoteAccept(QUOTE_ID))).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("treats the dev placeholder in development as secure (local dev still works)", () => {
    const m = loadWithEnv({
      NODE_ENV: "development",
      NPS_LINK_SECRET: PLACEHOLDER,
      BACKEND_PUBLIC_URL: "http://localhost:9000",
    })
    expect(m.insecure).toBe(false)
    expect(m.verifyQuoteDesign(QUOTE_ID, m.signQuoteDesign(QUOTE_ID))).toBe(true)
  })

  it("flags the dev placeholder in production as insecure and fails every verifier closed", () => {
    const m = loadWithEnv({
      NODE_ENV: "production",
      NPS_LINK_SECRET: PLACEHOLDER,
    })
    expect(m.insecure).toBe(true)
    // The boot-time guard logged loudly.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("NPS_LINK_SECRET")
    )
    // Even a structurally-valid signature is rejected — fail closed.
    expect(m.verifyQuoteDesign(QUOTE_ID, m.signQuoteDesign(QUOTE_ID))).toBe(false)
    expect(m.verifyQuoteAccept(QUOTE_ID, m.signQuoteAccept(QUOTE_ID))).toBe(false)
    expect(
      m.verifyArtworkApproval(ORDER_ID, m.signArtworkApproval(ORDER_ID))
    ).toBe(false)
    expect(m.verifyNpsRating(ORDER_ID, 9, m.signNpsRating(ORDER_ID, 9))).toBe(
      false
    )
  })

  it("flags an unset secret on a Fly deployment as insecure", () => {
    const m = loadWithEnv({
      NODE_ENV: "test",
      FLY_APP_NAME: "sc-prints-backend",
      NPS_LINK_SECRET: undefined,
    })
    expect(m.insecure).toBe(true)
    expect(m.verifyQuoteDesign(QUOTE_ID, m.signQuoteDesign(QUOTE_ID))).toBe(false)
  })

  it("flags the placeholder behind a non-localhost BACKEND_PUBLIC_URL as insecure", () => {
    const m = loadWithEnv({
      NODE_ENV: "test",
      BACKEND_PUBLIC_URL: "https://api.scprints.com.au",
      NPS_LINK_SECRET: PLACEHOLDER,
    })
    expect(m.insecure).toBe(true)
  })
})
