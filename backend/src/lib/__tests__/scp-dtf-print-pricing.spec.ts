import {
  decoratedSidesCountFromLineMetadata,
  resolveScpTierIndexForQuantity,
  scpPrintTotalMajorPerGarment,
  scpPrintUnitMajorForTier,
} from "../scp-dtf-print-pricing"

describe("scp-dtf-print-pricing", () => {
  it("maps quantity to blank-aligned tier indices", () => {
    expect(resolveScpTierIndexForQuantity(1)).toBe(0)
    expect(resolveScpTierIndexForQuantity(9)).toBe(0)
    expect(resolveScpTierIndexForQuantity(10)).toBe(1)
    expect(resolveScpTierIndexForQuantity(19)).toBe(1)
    expect(resolveScpTierIndexForQuantity(20)).toBe(2)
    expect(resolveScpTierIndexForQuantity(49)).toBe(2)
    expect(resolveScpTierIndexForQuantity(50)).toBe(3)
    expect(resolveScpTierIndexForQuantity(99)).toBe(3)
    expect(resolveScpTierIndexForQuantity(100)).toBe(4)
  })

  it("returns SCP matrix units per tier for up_to_a6", () => {
    expect(scpPrintUnitMajorForTier("up_to_a6", 0)).toBe(8.5)
    expect(scpPrintUnitMajorForTier("up_to_a6", 3)).toBe(5.5)
    expect(scpPrintUnitMajorForTier("up_to_a6", 4)).toBe(5)
  })

  it("sums print fees across decorated sides", () => {
    expect(
      scpPrintTotalMajorPerGarment({
        printSizeId: "up_to_a6",
        tierIndex: 3,
        decoratedSidesCount: 2,
      })
    ).toBe(11)
  })

  it("counts decorated sides from customizerDesign artifacts", () => {
    expect(
      decoratedSidesCountFromLineMetadata({
        customizerDesign: {
          artifacts: [{ side: "front" }, { side: "back" }],
        },
      })
    ).toBe(2)
  })

  it("falls back to one side when printPlacement is present without artifacts", () => {
    expect(
      decoratedSidesCountFromLineMetadata({
        printPlacement: { version: 1 },
      })
    ).toBe(1)
  })
})
