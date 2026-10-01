import { locations } from "./locations"

describe("locations data", () => {
  it("has unique slugs", () => {
    const slugs = locations.map((l) => l.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("keeps meta descriptions within the 155-char snippet limit", () => {
    const tooLong = locations.filter((l) => l.description.length > 155).map((l) => l.slug)
    expect(tooLong).toEqual([])
  })

  it("gives every interstate city a state (areaServed would say NSW otherwise)", () => {
    const nsw = ["sydney", "newcastle", "wollongong", "central-coast"]
    const missing = locations
      .filter((l) => l.kind === "city" && !nsw.includes(l.slug) && !l.state)
      .map((l) => l.slug)
    expect(missing).toEqual([])
  })
})
