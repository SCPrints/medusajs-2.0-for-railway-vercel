import { recommendMethods, type Answers } from "./recommend"

const best = (a: Answers) => recommendMethods(a)[0].method
const verdictOf = (a: Answers, method: string) =>
  recommendMethods(a).find((r) => r.method === method)!.verdict

describe("recommendMethods", () => {
  it("sends photos to DTF and rules the other two out", () => {
    const a: Answers = { quantity: "large", artwork: "photo", garment: "tee" }
    expect(best(a)).toBe("dtf")
    expect(verdictOf(a, "screen")).toBe("avoid")
    expect(verdictOf(a, "embroidery")).toBe("avoid")
  })

  it("never recommends screen printing under the minimum", () => {
    for (const artwork of ["solid", "logo"] as const)
      for (const garment of ["tee", "polo"] as const)
        expect(verdictOf({ quantity: "small", artwork, garment }, "screen")).toBe("avoid")
  })

  it("picks screen printing for a big run of solid-colour tees", () => {
    expect(best({ quantity: "large", artwork: "solid", garment: "tee" })).toBe("screen")
  })

  it("picks embroidery for logos on polos, headwear and jackets at any quantity", () => {
    for (const quantity of ["small", "medium", "large"] as const)
      for (const garment of ["polo", "headwear", "jacket"] as const)
        expect(best({ quantity, artwork: "logo", garment })).toBe("embroidery")
  })

  it("picks DTF for a small run of tees", () => {
    expect(best({ quantity: "small", artwork: "solid", garment: "tee" })).toBe("dtf")
    expect(best({ quantity: "small", artwork: "logo", garment: "tee" })).toBe("dtf")
  })

  it("always returns all three methods with exactly one best", () => {
    const quantities = ["small", "medium", "large"] as const
    const artworks = ["photo", "solid", "logo"] as const
    const garments = ["tee", "polo", "headwear", "jacket"] as const
    for (const quantity of quantities)
      for (const artwork of artworks)
        for (const garment of garments) {
          const r = recommendMethods({ quantity, artwork, garment })
          expect(r).toHaveLength(3)
          expect(r.filter((x) => x.verdict === "best")).toHaveLength(1)
        }
  })
})
