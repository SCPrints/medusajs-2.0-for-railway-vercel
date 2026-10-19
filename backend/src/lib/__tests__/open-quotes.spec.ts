import { openQuoteSubjectTag, summarizeOpenQuotes } from "../open-quotes"

const row = (over: Record<string, any>) => ({
  id: "qt_1",
  public_id: "Q-AAA",
  status: "new",
  subject: null,
  metadata: {},
  created_at: "2026-10-01T00:00:00.000Z",
  ...over,
})

describe("summarizeOpenQuotes", () => {
  it("keeps only new/quoted, drops the converted quote, newest first, capped", () => {
    const rows = [
      row({ id: "qt_old", public_id: "Q-OLD", created_at: "2026-09-01T00:00:00Z" }),
      row({ id: "qt_new", public_id: "Q-NEW", status: "quoted", created_at: "2026-10-02T00:00:00Z" }),
      row({ id: "qt_acc", public_id: "Q-ACC", status: "accepted" }),
      row({ id: "qt_conv", public_id: "Q-CONV", metadata: { order_id: "order_1" } }),
      row({ id: "qt_excl", public_id: "Q-EXCL" }),
    ]
    const out = summarizeOpenQuotes(rows, { excludeQuoteId: "qt_excl", orderId: "order_1", limit: 1 })
    expect(out.map((q) => q.public_id)).toEqual(["Q-NEW"])
    expect(out[0].status).toBe("quoted")
  })
})

describe("openQuoteSubjectTag", () => {
  it("formats none / one / many", () => {
    const one = summarizeOpenQuotes([row({})])
    const two = summarizeOpenQuotes([row({}), row({ id: "qt_2", public_id: "Q-BBB" })])
    expect(openQuoteSubjectTag([])).toBe("")
    expect(openQuoteSubjectTag(one)).toBe("[Open quote Q-AAA] ")
    expect(openQuoteSubjectTag(two)).toBe("[2 open quotes] ")
  })
})
