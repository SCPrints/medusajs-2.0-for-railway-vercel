import {
  buildMailtoUrl,
  buildReplyBody,
  MAX_MAILTO_URL,
} from "../contact-reply"

const base = {
  first_name: "Mike",
  last_name: "West",
  email: "mikejanta@gmail.com",
  phone: null,
  subject: "T-Shirt printing service",
  message: "I need your T-Shirt printing service",
  created_at: "2026-07-31T04:14:37.000Z",
  attachments: null,
}

describe("buildReplyBody", () => {
  it("greets by first name and quotes the enquiry", () => {
    const body = buildReplyBody(base, 900)
    expect(body).toContain("Hi Mike,")
    expect(body).toContain("From: Mike West <mikejanta@gmail.com>")
    expect(body).toContain("Subject: T-Shirt printing service")
    expect(body).toContain("I need your T-Shirt printing service")
  })

  it("falls back to 'there' when no first name was given", () => {
    expect(buildReplyBody({ ...base, first_name: null }, 900)).toContain("Hi there,")
  })

  it("lists attachment filenames but never their storage URLs", () => {
    const body = buildReplyBody(
      { ...base, attachments: [{ fileName: "logo.png" }, { fileName: "brief.pdf" }] },
      900
    )
    expect(body).toContain("You attached: logo.png, brief.pdf")
    expect(body).not.toContain("http")
  })

  it("omits the phone line when the submission predates the phone field", () => {
    expect(buildReplyBody(base, 900)).not.toContain("Phone:")
    expect(buildReplyBody({ ...base, phone: "0400 000 000" }, 900)).toContain(
      "Phone: 0400 000 000"
    )
  })

  it("marks the message as trimmed once it exceeds the limit", () => {
    const body = buildReplyBody({ ...base, message: "x".repeat(500) }, 100)
    expect(body).toContain("[trimmed — full message is in the admin]")
    expect(body).not.toContain("x".repeat(200))
  })
})

describe("buildMailtoUrl", () => {
  it("addresses the customer and prefixes the subject with Re:", () => {
    const url = buildMailtoUrl(base)
    expect(url.startsWith("mailto:mikejanta%40gmail.com?")).toBe(true)
    expect(url).toContain(`subject=${encodeURIComponent("Re: T-Shirt printing service")}`)
    expect(decodeURIComponent(url.split("&body=")[1])).toContain("Hi Mike,")
  })

  it("supplies a subject when the enquiry had none", () => {
    expect(buildMailtoUrl({ ...base, subject: null })).toContain(
      encodeURIComponent("Re: your enquiry — SC Prints")
    )
  })

  // The bug this guards: a fixed raw-character cap on the message still produced
  // a 2462-char url on a real submission, because percent-encoding triples every
  // newline and space. The budget must hold on pathological input.
  it("keeps the url within budget for a huge message and many attachments", () => {
    const url = buildMailtoUrl({
      ...base,
      subject: "A very long subject line ".repeat(5),
      message: "Lots of words and\nnewlines everywhere. ".repeat(200),
      attachments: Array.from({ length: 3 }, (_, i) => ({
        fileName: `a-fairly-long-attachment-filename-${i}.png`,
      })),
    })
    expect(url.length).toBeLessThanOrEqual(MAX_MAILTO_URL)
  })

  it("leaves short enquiries untrimmed", () => {
    const url = buildMailtoUrl(base)
    expect(decodeURIComponent(url)).not.toContain("[trimmed")
    expect(url.length).toBeLessThanOrEqual(MAX_MAILTO_URL)
  })
})
