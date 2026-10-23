const send = jest.fn()
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send } })) }))
jest.mock("../../templates", () => ({ generateEmailTemplate: () => null }))

import { ResendNotificationService } from "../resend"

const logger = { log: jest.fn() } as any
const svc = new ResendNotificationService({ logger }, { api_key: "re_test", from: "orders@example.com" })
const notification = { to: "a@example.com", channel: "email", template: "t", data: { emailOptions: {} } } as any

describe("ResendNotificationService.send", () => {
  it("throws when Resend returns an error instead of throwing (SDK v6)", async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "too big" } })
    await expect(svc.send(notification)).rejects.toThrow(/rejected.*validation_error - too big/)
  })

  it("resolves when Resend accepts the email", async () => {
    send.mockResolvedValueOnce({ data: { id: "e_1" }, error: null })
    await expect(svc.send(notification)).resolves.toEqual({})
  })
})
