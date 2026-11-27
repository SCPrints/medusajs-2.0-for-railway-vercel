import { passwordResetMessage, passwordResetUrl } from "../password-reset"

jest.mock("../constants", () => ({ SUPPORT_REPLY_TO_EMAIL: "help@shop.test" }))
jest.mock("../../modules/email-notifications/templates", () => ({ EmailTemplates: { CUSTOMER_MESSAGE: "customer-message" } }))
// eslint-disable-next-line import/first
import passwordResetHandler from "../../subscribers/auth-password-reset"

const realEnv = process.env
beforeEach(() => {
  process.env = {
    ...realEnv,
    STOREFRONT_URL: "https://shop.test/",
    STOREFRONT_DEFAULT_COUNTRY_CODE: "au",
    BACKEND_PUBLIC_URL: "https://api.shop.test",
    ADMIN_PUBLIC_URL: "",
  }
})
afterAll(() => {
  process.env = realEnv
})

describe("passwordResetUrl", () => {
  it("sends a customer to the shop's reset page, token and email encoded", () => {
    expect(passwordResetUrl("customer", "a.b+c", "pat+work@club.test")).toBe(
      "https://shop.test/au/reset-password?token=a.b%2Bc&email=pat%2Bwork%40club.test"
    )
  })

  it("sends staff to the admin's reset page", () => {
    expect(passwordResetUrl("user", "tok", "staff@shop.test")).toBe(
      "https://api.shop.test/app/reset-password?token=tok&email=staff%40shop.test"
    )
  })

  it("builds nothing without a shop address, a token, an email, or for another actor type", () => {
    expect(passwordResetUrl("customer", "", "a@b.test")).toBeNull()
    expect(passwordResetUrl("customer", "tok", "")).toBeNull()
    expect(passwordResetUrl("vendor", "tok", "a@b.test")).toBeNull()
    delete process.env.STOREFRONT_URL
    expect(passwordResetUrl("customer", "tok", "a@b.test")).toBeNull()
  })
})

describe("auth.password_reset subscriber", () => {
  const run = async (createNotifications: jest.Mock) => {
    const logger = { warn: jest.fn(), error: jest.fn() }
    const container = { resolve: (key: string) => (key === "logger" ? logger : { createNotifications }) }
    await passwordResetHandler({
      event: { data: { entity_id: "pat@club.test", actor_type: "customer", token: "SECRET-TOKEN" } },
      container,
    } as any)
    return logger
  }

  it("emails the customer the link", async () => {
    const send = jest.fn().mockResolvedValue([])
    await run(send)
    const sent = send.mock.calls[0][0]
    expect(sent.to).toBe("pat@club.test")
    expect(sent.data.emailOptions.subject).toBe("Reset your SC Prints password")
    const url = "https://shop.test/au/reset-password?token=SECRET-TOKEN&email=pat%40club.test"
    expect(sent.data.message).toEqual(passwordResetMessage(url))
    // The link lives on the button only: no raw URL in the words.
    expect(sent.data.message.button).toEqual({ label: "Choose a new password", url })
    expect(sent.data.message.body + sent.data.message.footnote).not.toContain("http")
  })

  it("survives a mail failure and never writes the token to the log", async () => {
    const logger = await run(jest.fn().mockRejectedValue(new Error("mail down")))
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls])).not.toContain("SECRET-TOKEN")
  })
})
