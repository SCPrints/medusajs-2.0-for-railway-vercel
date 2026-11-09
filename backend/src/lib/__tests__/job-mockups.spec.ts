import { jobMockups } from "../job-mockups"

describe("jobMockups", () => {
  const line = (id: string, arts: any[]) => ({ id, metadata: { customizerDesign: { artifacts: arts } } })

  it("takes Studio mockups, skips inline data, dedupes per-size lines", () => {
    const arts = [{ side: "front", mockupUrl: "https://x/f.png" }, { side: "back", mockupUrl: "data:image/png;base64,AAA" }]
    expect(jobMockups([line("a", arts), line("b", arts)], undefined)).toEqual(["https://x/f.png"])
  })

  it("newest revised proof replaces that line + side", () => {
    const out = jobMockups(
      [line("a", [{ side: "front", mockupUrl: "https://x/f.png" }, { side: "back", mockupUrl: "https://x/b.png" }])],
      [
        { line_item_id: "a", side: "front", url: "https://x/new.png", uploaded_at: "2026-11-02" },
        { line_item_id: "a", side: "front", url: "https://x/old.png", uploaded_at: "2026-11-01" },
      ]
    )
    expect(out).toEqual(["https://x/new.png", "https://x/b.png"])
  })

  it("reads quote lines and returns nothing for plain jobs", () => {
    expect(jobMockups([{ id: "q", customizerDesign: { artifacts: [{ mockupUrl: "https://x/q.png" }] } }], null)).toEqual(["https://x/q.png"])
    expect(jobMockups([{ id: "p" }], null)).toEqual([])
  })
})
