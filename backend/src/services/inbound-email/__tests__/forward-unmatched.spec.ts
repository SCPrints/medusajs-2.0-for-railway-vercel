jest.mock("../../../lib/constants", () => ({
  CONTACT_NOTIFICATION_EMAIL: "info@example.com",
  ORDER_INBOX_DOMAIN: "jobs.example.com",
  SUPPORT_REPLY_TO_EMAIL: "info@example.com",
}))

import { forwardUnmatchedEmail } from "../record"

const containerWith = (send: jest.Mock) =>
  ({
    resolve: (key: string) =>
      key === "logger" ? { warn: jest.fn(), info: jest.fn() } : { createNotifications: send },
  }) as any

describe("forwardUnmatchedEmail", () => {
  it("sends the unmatched email to staff with the sender as reply-to", async () => {
    const send = jest.fn().mockResolvedValue(undefined)
    const sent = await forwardUnmatchedEmail(containerWith(send), {
      to: ["inbox+qotOLD123@jobs.example.com"],
      from: "Pat Lee <pat@club.org>",
      subject: "Re: your quote",
      text: "Yes please go ahead\n\nOn Mon, SC Prints wrote:\n> old thread",
      html: null,
    })
    expect(sent).toBe(true)
    const arg = send.mock.calls[0][0]
    expect(arg.to).toBe("info@example.com")
    expect(arg.data.emailOptions).toEqual({ subject: "Unmatched email — Re: your quote", replyTo: "Pat Lee <pat@club.org>" })
    expect(arg.data.alert.kind).toBe("unmatched_email")
    expect(arg.data.alert.excerpt).toBe("Yes please go ahead")
  })

  it("never forwards mail from our own inbox domain (no loops)", async () => {
    const send = jest.fn()
    const sent = await forwardUnmatchedEmail(containerWith(send), {
      to: ["inbox+ordX@jobs.example.com"],
      from: "Auto <inbox+qotY@JOBS.example.com>",
      subject: null,
      text: "auto reply",
      html: null,
    })
    expect(sent).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})
