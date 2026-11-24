import { classifyDecorationPricing } from "../decoration-pricing-class"

describe("classifyDecorationPricing", () => {
  it("reads the polyester % from the description (JB's / Podium)", () => {
    expect(classifyDecorationPricing({ title: "Podium Swirl Polo", description: "• 100% Polyester for durability, 160gsm pique" }).cls).toBe("supacolour")
    expect(classifyDecorationPricing({ title: "Focus Polo", description: "80% polyester 20% cotton" }).cls).toBe("supacolour")
  })
  it("leaves blends under 80% and cotton on DTF", () => {
    expect(classifyDecorationPricing({ title: "Staple Tee", material: "65% polyester, 35% cotton" }).cls).toBeNull()
    expect(classifyDecorationPricing({ title: "Staple Tee", material: "100% cotton" }).cls).toBeNull()
  })
  it("sends technical fabrics to a quote", () => {
    expect(classifyDecorationPricing({ title: "Streetworx Hooded Puffer Jacket", description: "100% polyester" }).cls).toBe("quote_only")
  })
})
