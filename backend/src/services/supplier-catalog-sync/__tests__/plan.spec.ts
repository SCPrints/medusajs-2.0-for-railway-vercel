import { planCatalogSync, type FeedItem, type OurProduct } from "../plan"

const feed = (code: string, extra: Partial<FeedItem> = {}): FeedItem => ({
  code,
  handle: `h-${code}`,
  name: code,
  discontinued: false,
  ...extra,
})
const ours = (code: string, extra: Partial<OurProduct> = {}): OurProduct => ({
  id: `prod_${code}`,
  handle: `h-${code}`,
  title: code,
  status: "published",
  code,
  ...extra,
})

describe("planCatalogSync", () => {
  it("adds new styles, skips discontinued and ones we already have", () => {
    const plan = planCatalogSync(
      [feed("4034"), feed("1130"), feed("5401S", { discontinued: true })],
      [ours("1130")]
    )
    expect(plan.toAdd.map((f) => f.code)).toEqual(["4034"])
    expect(plan.toHide).toEqual([])
  })

  it("matches by code even when the handle changed (renamed style)", () => {
    const plan = planCatalogSync([feed("1130", { handle: "as-colour-new-name-1130" })], [ours("1130")])
    expect(plan.toAdd).toEqual([])
  })

  it("never re-adds a style we hid as draft", () => {
    const plan = planCatalogSync([feed("4069")], [ours("4069", { status: "draft" })])
    expect(plan.toAdd).toEqual([])
    expect(plan.toHide).toEqual([])
  })

  it("hides discontinued and no-longer-listed live products", () => {
    const plan = planCatalogSync(
      [feed("A"), feed("B", { discontinued: true })],
      [ours("A"), ours("B"), ours("C"), ours("D", { status: "draft" })]
    )
    expect(plan.toHide.map((p) => [p.code, p.reason])).toEqual([
      ["B", "discontinued"],
      ["C", "not_listed"],
    ])
    expect(plan.hideBlockedReason).toBeNull()
  })

  it("refuses to hide when too many vanished from the feed (bad feed)", () => {
    const many = Array.from({ length: 200 }, (_, i) => ours(`X${i}`))
    const plan = planCatalogSync([feed("X0")], many)
    expect(plan.toHide).toHaveLength(199)
    expect(plan.hideBlockedReason).toMatch(/not hidden/)
  })

  it("trusts explicit discontinued flags even when there are many", () => {
    const codes = Array.from({ length: 15 }, (_, i) => `D${i}`)
    const plan = planCatalogSync(
      codes.map((c) => feed(c, { discontinued: true })),
      codes.map((c) => ours(c))
    )
    expect(plan.toHide).toHaveLength(15)
    expect(plan.hideBlockedReason).toBeNull()
  })

  it("does nothing on an empty feed", () => {
    const plan = planCatalogSync([], [ours("A")])
    expect(plan.toAdd).toEqual([])
    expect(plan.toHide).toEqual([])
    expect(plan.hideBlockedReason).toBeTruthy()
  })
})
