import { isDarkGarmentColourName, priceGroupedJob, type JobSpec, type ResolvedGarment } from "../quote-pricing"

const garment = (over: Partial<ResolvedGarment> = {}): ResolvedGarment => ({
  title: "Tee",
  unitSellMajor: 20,
  unitCostExMajor: 8,
  supacolour: false,
  screenHeavy: false,
  ...over,
})

// A real mixed job: caps embroidered, hoodies screened (black + white rows),
// tees DTF with a 3XL upcharge, poly polos Supacolour — one shared front
// logo (A) and a different back print (B).
const job: JobSpec = {
  designs: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
  ],
  groups: [
    { id: "caps", title: "Cap", rows: [{ id: "c1", label: "Black", quantity: 50, garment: garment({ title: "Cap" }), darkGarment: true }], positions: [{ method: "embroidery", stitchCount: 5000, designId: "A" }] },
    {
      id: "hoods",
      title: "Hood",
      rows: [
        { id: "h-black", label: "Black / L", quantity: 6, garment: garment({ title: "Hood", screenHeavy: true }), darkGarment: true },
        { id: "h-white", label: "White / L", quantity: 4, garment: garment({ title: "Hood", screenHeavy: true }), darkGarment: false },
      ],
      positions: [
        { method: "screen", colours: 3, designId: "A" },
        { method: "screen", colours: 1, designId: "B" },
      ],
    },
    {
      id: "tees",
      title: "Tee",
      rows: [
        { id: "t-m", label: "Navy / M", quantity: 40, garment: garment({ title: "Tee" }), darkGarment: true },
        { id: "t-3xl", label: "Navy / 3XL", quantity: 10, garment: garment({ title: "Tee", unitSellMajor: 23 }), darkGarment: true },
      ],
      positions: [
        { method: "print", sizeId: "up_to_a4", designId: "A" },
        { method: "print", sizeId: "up_to_a6", designId: "B" },
      ],
    },
    { id: "polys", title: "Poly polo", rows: [{ id: "p1", label: "Red / M", quantity: 40, garment: garment({ title: "Poly polo", supacolour: true }) }], positions: [{ method: "print", sizeId: "up_to_a4", designId: "A" }] },
  ],
}

describe("priceGroupedJob", () => {
  const r = priceGroupedJob(job)
  const by = (id: string) => r.groups.find((g) => g.groupId === id)!

  it("tiers full-colour prints on the job-wide garment quantity", () => {
    // 50 + 10 + 50 + 40 = 150 garments → 100+ band (checkout aggregates the cart the same way).
    expect(r.garmentQuantity).toBe(150)
    expect(r.printTierIndex).toBe(4)
    expect(by("tees").rows[0].components[1].unitSellMajor).toBe(9) // A4 @ 100+
    expect(by("tees").rows[0].components[2].unitSellMajor).toBe(5.5) // A6 @ 100+
  })

  it("prices each row at its own variant — the 3XL upcharge flows through", () => {
    const tees = by("tees")
    expect(tees.rows[0].unitSellMajor).toBe(34.5) // 20 + 9 + 5.5
    expect(tees.rows[1].unitSellMajor).toBe(37.5) // 23 + 9 + 5.5
    expect(tees.unitSellMin).toBe(34.5)
    expect(tees.unitSellMax).toBe(37.5)
    expect(tees.sellTotalMajor).toBe(40 * 34.5 + 10 * 37.5)
    expect(tees.unitSellMajor).toBe(35.1) // quantity-weighted
    expect(tees.quantity).toBe(50)
  })

  it("screen print tiers per group; underbase only on the dark rows; heavy on all", () => {
    const hoods = by("hoods")
    const black = hoods.rows[0].components
    const white = hoods.rows[1].components
    expect(black[1].unitSellMajor).toBe(16.85) // 3 col + underbase = 4 @ 25–49 (10 < min) + $1 heavy
    expect(white[1].unitSellMajor).toBe(14.75) // 3 col, no underbase, + $1 heavy
    expect(black[2].unitSellMajor).toBe(12.6) // 1 col + underbase = 2 + $1
    expect(white[2].unitSellMajor).toBe(10.5) // 1 col + $1
    expect(r.warnings).toContain("Hood: screen printing minimum is 25 — 10 prices at the 25–49 band.")
  })

  it("switches to the Supacolour card on a flagged garment at the job tier", () => {
    expect(by("polys").rows[0].components[1].unitSellMajor).toBe(12.5) // A4 Supacolour @ 100+
  })

  it("charges every setup once per DESIGN, shared across garments and rows", () => {
    const keys = r.extras.map((c) => c.key).sort()
    expect(keys).toEqual(["digitizing-A", "screen-setup-A", "screen-setup-B", "supacolour-setup-A"])
    // Screens for A: the dark rows need the underbase screen → 3 + 1.
    expect(r.extras.find((c) => c.key === "screen-setup-A")).toMatchObject({ quantity: 4, unitSellMajor: 99 })
    expect(r.extras.find((c) => c.key === "screen-setup-B")).toMatchObject({ quantity: 2 })
    expect(r.extras.find((c) => c.key === "supacolour-setup-A")).toMatchObject({ quantity: 1, unitSellMajor: 69 })
    expect(r.extras.find((c) => c.key === "digitizing-A")?.notes?.[0]).toBe("Used on: Cap")
    expect(r.extras.find((c) => c.key === "screen-setup-A")?.notes?.[0]).toBe("Used on: Hood")
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
      groups: [{ id: "g", title: "Customer-supplied garments", rows: [{ id: "r", label: "Dark garments", quantity: 20, garment: null, darkGarment: true }], positions: [{ method: "print", channel: "byo", sizeId: "up_to_a3", designId: "A" }] }],
    })
    expect(byo.groups[0].rows[0].components).toHaveLength(1)
    expect(byo.groups[0].unitSellMajor).toBe(17.5)
    expect(byo.extras).toHaveLength(0)
  })
})

describe("priceGroupedJob negotiation tools", () => {
  const base = priceGroupedJob(job)

  it("unit override replaces the computed unit for every row; cost unchanged", () => {
    const r = priceGroupedJob({ ...job, groups: job.groups.map((g) => (g.id === "tees" ? { ...g, unitSellOverrideMajor: 30 } : g)) })
    const tees = r.groups.find((g) => g.groupId === "tees")!
    expect(tees.rows.map((x) => x.unitSellMajor)).toEqual([30, 30])
    expect(tees.rows[0].computedUnitSellMajor).toBe(34.5)
    expect(tees.rows[0].unitCostExMajor).toBe(base.groups.find((g) => g.groupId === "tees")!.rows[0].unitCostExMajor)
    expect(tees.sellTotalMajor).toBe(1500)
  })

  it("rounds unit sells UP to the step", () => {
    const r = priceGroupedJob({ ...job, roundUnitTo: 0.5 })
    expect(r.groups.find((g) => g.groupId === "tees")!.rows[0].unitSellMajor).toBe(34.5)
    const r1 = priceGroupedJob({ ...job, roundUnitTo: 1 })
    expect(r1.groups.find((g) => g.groupId === "tees")!.rows[0].unitSellMajor).toBe(35)
    expect(r1.groups.find((g) => g.groupId === "hoods")!.rows[0].unitSellMajor).toBe(50) // 20 + 16.85 + 12.6 = 49.45 → 50
  })

  it("waived setups list at $0 but keep their cost; extras join the totals", () => {
    const r = priceGroupedJob({
      ...job,
      waivedKeys: ["screen-setup-A"],
      extras: [{ id: "cc", label: "Colour change", quantity: 2, unitSellMajor: 45, unitCostExMajor: 35 }],
    })
    const screens = r.extras.find((c) => c.key === "screen-setup-A")!
    expect(screens.sellTotalMajor).toBe(0)
    expect(screens.costTotalExMajor).toBe(280)
    expect(screens.label).toMatch(/waived$/)
    const cc = r.extras.find((c) => c.key === "extra-cc")!
    expect(cc).toMatchObject({ quantity: 2, unitSellMajor: 45, sellTotalMajor: 90, costTotalExMajor: 70 })
    expect(r.totals.subtotalIncMajor).toBe(Math.round((base.totals.subtotalIncMajor - 396 + 90) * 100) / 100)
  })

  it("job discount comes off the subtotal; margin is measured on the discounted sell", () => {
    const pct = priceGroupedJob({ ...job, discount: { kind: "percent", value: 10 } })
    expect(pct.totals.discountMajor).toBe(Math.round(base.totals.subtotalIncMajor * 10) / 100)
    expect(pct.totals.sellIncMajor).toBe(Math.round((base.totals.subtotalIncMajor - pct.totals.discountMajor) * 100) / 100)
    expect(pct.totals.marginPct!).toBeLessThan(base.totals.marginPct!)
    const amt = priceGroupedJob({ ...job, discount: { kind: "amount", value: 500 } })
    expect(amt.totals.discountMajor).toBe(500)
    const capped = priceGroupedJob({ ...job, discount: { kind: "amount", value: 1e9 } })
    expect(capped.totals.sellIncMajor).toBe(0)
  })
})

describe("isDarkGarmentColourName", () => {
  it("flags dark colours, lets light ones through, light words win", () => {
    expect(isDarkGarmentColourName("Black")).toBe(true)
    expect(isDarkGarmentColourName("NAVY")).toBe(true)
    expect(isDarkGarmentColourName("White")).toBe(false)
    expect(isDarkGarmentColourName("Arctic Blue")).toBe(false)
    expect(isDarkGarmentColourName("Light Blue")).toBe(false)
    expect(isDarkGarmentColourName(null)).toBe(false)
  })
})

describe("priceGroupedJob rush", () => {
  const tee = garment({ title: "Tee" })
  const base: JobSpec = {
    designs: [{ id: "A", label: "A" }],
    groups: [
      { id: "tees", title: "Tee", rows: [{ id: "t", label: "Black / M", quantity: 50, garment: tee, darkGarment: true }], positions: [{ method: "print", sizeId: "up_to_a4", designId: "A" }] },
      { id: "caps", title: "Cap", rows: [{ id: "c", label: "Black", quantity: 50, garment: garment({ title: "Cap" }) }], positions: [{ method: "embroidery", stitchCount: 5000, designId: "A" }] },
    ],
    uvdtf: { metres: 2 },
  }

  it("adds one flat fee per technique used (storefront rush.ts numbers)", () => {
    const r = priceGroupedJob({ ...base, rush: "priority" })
    const fees = Object.fromEntries(r.extras.filter((c) => c.key.startsWith("rush-")).map((c) => [c.key, c.unitSellMajor]))
    expect(fees).toEqual({ "rush-print": 15, "rush-embroidery": 25, "rush-uvdtf": 20 })
    const e = priceGroupedJob({ ...base, rush: "express" })
    expect(e.extras.find((c) => c.key === "rush-print")?.unitSellMajor).toBe(35)
    expect(priceGroupedJob(base).extras.some((c) => c.key.startsWith("rush-"))).toBe(false)
  })

  it("screen rush = 30% of screen print + screen setup, costed at the same 30%, no express tier", () => {
    const job: JobSpec = {
      designs: [{ id: "A", label: "A" }],
      groups: [{ id: "h", title: "Hood", rows: [{ id: "h1", label: "White / L", quantity: 50, garment: tee, darkGarment: false }], positions: [{ method: "screen", colours: 2, designId: "A" }] }],
      rush: "express",
    }
    const r = priceGroupedJob(job)
    const printSell = r.groups[0].rows[0].components.find((c) => c.key === "pos-0")!
    const setup = r.extras.find((c) => c.key === "screen-setup-A")!
    const rush = r.extras.find((c) => c.key === "rush-screen")!
    expect(rush.unitSellMajor).toBe(Math.round((printSell.sellTotalMajor + setup.sellTotalMajor) * 0.3 * 100) / 100)
    expect(rush.unitCostExMajor).toBe(Math.round((printSell.costTotalExMajor! + setup.costTotalExMajor!) * 0.3 * 100) / 100)
    expect(r.extras.some((c) => c.key === "rush-print")).toBe(false)
    expect(r.warnings.some((w) => /no express/.test(w))).toBe(true)
  })
})
