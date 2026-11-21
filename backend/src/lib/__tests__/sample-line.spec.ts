import { cleanSampleMetadata, sampleBlockReason } from "../sample-line"
import { allowlistClientLineMetadata } from "../client-line-metadata"

const design = (m: Record<string, string>) => ({
  customizerDesign: { sideDecorationMethods: m, artifacts: Object.keys(m).map((side) => ({ side })) },
})

describe("sampleBlockReason", () => {
  it("offers a DTF print and an embroidered polo", () => {
    expect(sampleBlockReason(design({ front: "print" }), "Tee")).toBeNull()
    expect(sampleBlockReason(design({ front: "embroidery" }), "Polo")).toBeNull()
  })
  it("blocks screen printing and embroidered caps", () => {
    expect(sampleBlockReason(design({ front: "screen" }), "Tee")).toMatch(/25/)
    expect(sampleBlockReason(design({ front: "embroidery" }), "Trucker Cap")).toMatch(/10/)
    expect(sampleBlockReason(design({ front: "print" }), "Trucker Cap")).toBeNull()
  })
  it("blocks lines with no design", () => {
    expect(sampleBlockReason({}, "Tee")).not.toBeNull()
  })
})

describe("sample metadata", () => {
  it("keeps only sample: true and a short sample_of", () => {
    const o: Record<string, unknown> = { sample: "yes", sample_of: "x".repeat(70) }
    cleanSampleMetadata(o)
    expect(o).toEqual({})
    expect(allowlistClientLineMetadata({ sample: true, sample_of: "order_1" }).metadata).toEqual({ sample: true, sample_of: "order_1" })
  })
})
