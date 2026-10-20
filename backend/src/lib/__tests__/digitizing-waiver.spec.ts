import { decideDigitizingWaivers } from "../digitizing-waiver"

const emb = (opts: { src?: string; w?: number; h?: number; claimWaived?: boolean }) => ({
  customizerDesign: {
    prints: [{ side: "front", sizeId: "up_to_a6" }],
    sideDecorationMethods: { front: "embroidery" },
    sideEmbroideryConfigs: {
      front: { stitchCount: 3000, includeDigitizingFee: !opts.claimWaived, widthMm: opts.w ?? 80, heightMm: opts.h ?? 80 },
    },
    sideLayouts: [{ side: "front", objects: opts.src ? [{ type: "Image", src: opts.src }] : [] }],
  },
})

const fee = (m: Record<string, unknown>) =>
  ((m.customizerDesign as any).sideEmbroideryConfigs.front as { includeDigitizingFee: boolean }).includeDigitizingFee

describe("decideDigitizingWaivers (review 1-3: fee on new or resized artwork)", () => {
  it("charges when the customer claims a prior job but no order carries the artwork", () => {
    expect(fee(decideDigitizingWaivers(emb({ src: "https://r2/logo", claimWaived: true }), []))).toBe(true)
  })

  it("waives when a prior order has the same artwork at the same size (±5%)", () => {
    const prior = emb({ src: "https://r2/logo", w: 82, h: 80 })
    expect(fee(decideDigitizingWaivers(emb({ src: "https://r2/logo", claimWaived: true }), [prior]))).toBe(false)
    // Even when the customer didn't claim it.
    expect(fee(decideDigitizingWaivers(emb({ src: "https://r2/logo" }), [prior]))).toBe(false)
  })

  it("charges again for a resize beyond tolerance or a different artwork", () => {
    expect(fee(decideDigitizingWaivers(emb({ src: "https://r2/logo", claimWaived: true }), [emb({ src: "https://r2/logo", w: 250, h: 250 })]))).toBe(true)
    expect(fee(decideDigitizingWaivers(emb({ src: "https://r2/logo", claimWaived: true }), [emb({ src: "https://r2/other" })]))).toBe(true)
  })

  it("unfingerprintable artwork always pays", () => {
    expect(fee(decideDigitizingWaivers(emb({ claimWaived: true }), [emb({})]))).toBe(true)
  })
})
