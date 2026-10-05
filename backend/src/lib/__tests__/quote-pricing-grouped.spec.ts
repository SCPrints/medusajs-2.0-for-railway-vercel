import { priceGroupedJob, type JobSpec, type ResolvedGarment } from "../quote-pricing"

const garment = (over: Partial<ResolvedGarment> = {}): ResolvedGarment => ({
  title: "Tee",
  unitSellMajor: 20,
  unitCostExMajor: 8,
  supacolour: false,
  screenHeavy: false,
  ...over,
})

// The user's test job: caps embroidered, hoodies screened, tees DTF — one
// shared front logo (A) and a different back print (B).
const job: JobSpec = {
  designs: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
  ],
  groups: [
    { id: "caps", quantity: 50, garment: garment({ title: "Cap" }), positions: [{ method: "embroidery", stitchCount: 5000, designId: "A" }] },
    {
      id: "hoods",
      quantity: 10,
      garment: garment({ title: "Hood", screenHeavy: true }),
      positions: [
        { method: "screen", colours: 3, darkGarment: true, designId: "A" },
        { method: "screen", colours: 1, designId: "B" },
      ],
    },
    {
      id: "tees",
      quantity: 50,
      garment: garment({ title: "Tee" }),
      positions: [
        { method: "print", sizeId: "up_to_a4", designId: "A" },
        { method: "print", sizeId: "up_to_a6", designId: "B" },
      ],
    },
    { id: "polys", quantity: 40, garment: garment({ title: "Poly polo", supacolour: true }), positions: [{ method: "print", sizeId: "up_to_a4", designId: "A" }] },
  ],
}

describe("priceGroupedJob", () => {
  const r = priceGroupedJob(job)
  const by = (id: string) => r.groups.find((g) => g.groupId === id)!

  it("tiers full-colour prints on the job-wide print quantity (gang sheets)", () => {
    // tees 50 + poly 40 = 90 → 50–99 band; caps/hoods carry no print.
    expect(r.printQuantity).toBe(90)
    expect(r.printTierIndex).toBe(3)
    expect(by("tees").components[1].unitSellMajor).toBe(9.5) // A4 @ 50–99
    expect(by("tees").components[2].unitSellMajor).toBe(6) // A6 @ 50–99
  })

  it("tiers screen print per group, with underbase + heavy on the hoodies", () => {
    const [, front, back] = by("hoods").components
    expect(front.unitSellMajor).toBe(16.85) // 4 colours @ 25–49 (10 < min) + $1 heavy
    expect(back.unitSellMajor).toBe(10.5) // 1 colour + $1 heavy
    expect(r.warnings).toContain("Hood: screen printing minimum is 25 — 10 prices at the 25–49 band.")
  })

  it("switches to the Supacolour card on a flagged garment at the same job tier", () => {
    expect(by("polys").components[1].unitSellMajor).toBe(13.5) // A4 Supacolour @ 50–99
  })

  it("charges every setup once per DESIGN, shared across garments", () => {
    const keys = r.extras.map((c) => c.key).sort()
    expect(keys).toEqual(["digitizing-A", "screen-setup-A", "screen-setup-B", "supacolour-setup-A"])
    expect(r.extras.find((c) => c.key === "screen-setup-A")).toMatchObject({ quantity: 4, unitSellMajor: 99 }) // 3 col + underbase
    expect(r.extras.find((c) => c.key === "screen-setup-B")).toMatchObject({ quantity: 1 })
    expect(r.extras.find((c) => c.key === "supacolour-setup-A")).toMatchObject({ quantity: 1, unitSellMajor: 69 })
    expect(r.extras.find((c) => c.key === "digitizing-A")?.notes?.[0]).toBe("Used on: Cap")
  })

  it("repeat design: repeat screen/supacolour rates, digitizing waived", () => {
    const rep = priceGroupedJob({ ...job, designs: [{ id: "A", label: "A", repeat: true }, { id: "B", label: "B" }] })
    expect(rep.extras.find((c) => c.key === "screen-setup-A")?.unitSellMajor).toBe(39)
    expect(rep.extras.find((c) => c.key === "supacolour-setup-A")?.unitSellMajor).toBe(35)
    expect(rep.extras.find((c) => c.key === "digitizing-A")).toBeUndefined()
    expect(rep.extras.find((c) => c.key === "screen-setup-B")?.unitSellMajor).toBe(99)
  })

  it("sums group + setup totals and reports margin over the costed parts", () => {
    const groupsSell = r.groups.reduce((s, g) => s + g.sellTotalMajor, 0)
    const extrasSell = r.extras.reduce((s, c) => s + c.sellTotalMajor, 0)
    expect(r.totals.sellIncMajor).toBe(Math.round((groupsSell + extrasSell) * 100) / 100)
    expect(r.totals.unknownCostCount).toBe(0)
    expect(r.totals.marginPct).toBeGreaterThan(20)
  })

  it("prices supplied garments on the trade/BYO cards with no garment component", () => {
    const byo = priceGroupedJob({
      designs: [{ id: "A", label: "A" }],
      groups: [{ id: "g", quantity: 20, garment: null, positions: [{ method: "print", channel: "byo", sizeId: "up_to_a3", designId: "A" }] }],
    })
    expect(byo.groups[0].components).toHaveLength(1)
    expect(byo.groups[0].unitSellMajor).toBe(17.5)
    expect(byo.extras).toHaveLength(0)
  })
})
