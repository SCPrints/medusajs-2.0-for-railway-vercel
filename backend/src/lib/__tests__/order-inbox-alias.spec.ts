import { parseInboxAlias, stripQuotedReply } from "../order-inbox-alias"

describe("parseInboxAlias", () => {
  it("reads order and quote aliases, bare or in Name <addr> form", () => {
    expect(parseInboxAlias("inbox+ord01k7abcdef12@jobs.scprints.com.au")).toEqual({
      kind: "order",
      suffix: "01k7abcdef12",
    })
    expect(parseInboxAlias("SC Prints <inbox+qt01K7ABCDEF12@jobs.scprints.com.au>")).toEqual({
      kind: "quote",
      suffix: "01k7abcdef12",
    })
  })

  it("rejects anything else", () => {
    expect(parseInboxAlias("info@scprints.com.au")).toBeNull()
    expect(parseInboxAlias("inbox+ord123@jobs.scprints.com.au")).toBeNull()
    expect(parseInboxAlias(undefined as any)).toBeNull()
  })
})

describe("stripQuotedReply", () => {
  it("keeps the new text and drops the quoted thread", () => {
    const mail = [
      "Hey Sean,",
      "",
      "Just checking if there's anything needing to be done on my end?",
      "",
      "Cheers",
      "Dean",
      "",
      "On Fri, 16 Oct 2026 at 1:15 pm, Dean <dean@example.com> wrote:",
      "> 18 Kerr Cres, Pagewood NSW 2035.",
    ].join("\n")
    expect(stripQuotedReply(mail)).toBe(
      "Hey Sean,\n\nJust checking if there's anything needing to be done on my end?\n\nCheers\nDean"
    )
  })

  it("cuts an Outlook header block but not a sentence starting with From:", () => {
    const outlook = "Thanks!\n\nFrom: SC Prints <info@scprints.com.au>\nSent: Friday\nTo: Dean\nSubject: Re: quote\n\nold text"
    expect(stripQuotedReply(outlook)).toBe("Thanks!")
    expect(stripQuotedReply("From: the look of it, 24 cm is right.\nCheers")).toBe(
      "From: the look of it, 24 cm is right.\nCheers"
    )
  })
})
