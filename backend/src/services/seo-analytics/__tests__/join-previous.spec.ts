import { attachPrevious } from "../join-previous"

const row = (key: string, clicks: number, impressions: number, ctr: number, position: number) => ({
  key,
  clicks,
  impressions,
  ctr,
  position,
})

describe("attachPrevious", () => {
  it("joins by key and attaches prior metrics", () => {
    const out = attachPrevious([row("a", 10, 100, 0.1, 5)], [row("a", 8, 90, 0.088, 6)])
    expect(out[0].previous).toEqual({ clicks: 8, impressions: 90, ctr: 0.088, position: 6 })
  })

  it("leaves previous undefined when no prior row matches (new query)", () => {
    const out = attachPrevious([row("new", 5, 50, 0.1, 3)], [row("old", 1, 10, 0.1, 9)])
    expect(out[0].previous).toBeUndefined()
  })
})
