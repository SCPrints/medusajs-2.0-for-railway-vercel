import { cleanCompliance, mergeCompliance } from "../compliance"

describe("compliance", () => {
  it("trims, caps, dedupes and drops empties", () => {
    const c = cleanCompliance({
      country_of_origin: "  Bangladesh ",
      fibre_content: "",
      certifications: ["WRAP", "WRAP", " ", "x".repeat(200)],
      care: "y".repeat(1000),
      statement_url: "javascript:alert(1)",
    })
    expect(c?.country_of_origin).toBe("Bangladesh")
    expect(c?.fibre_content).toBeUndefined()
    expect(c?.certifications).toHaveLength(2)
    expect(c?.certifications?.[1]).toHaveLength(80)
    expect(c?.care).toHaveLength(400)
    expect(c?.statement_url).toBeUndefined()
  })
  it("returns null for nothing", () => {
    expect(cleanCompliance({})).toBeNull()
    expect(cleanCompliance("x")).toBeNull()
  })
  it("product overrides the brand default, empty fields fall back", () => {
    const m = mergeCompliance(
      { country_of_origin: "China", fibre_content: "100% cotton", statement_url: "https://a.example/s.pdf" },
      { country_of_origin: "Vietnam", fibre_content: "" }
    )
    expect(m).toEqual({ country_of_origin: "Vietnam", fibre_content: "100% cotton", statement_url: "https://a.example/s.pdf" })
    expect(mergeCompliance(null, null)).toBeNull()
  })
})
