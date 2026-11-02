import {
  inferDecorationMethodFromCustomizer,
  itemMethod,
} from "../reports/orders"

describe("itemMethod / inferDecorationMethodFromCustomizer", () => {
  it("uses decorationDesign.method when set", () => {
    expect(
      itemMethod({
        metadata: { decorationDesign: { method: "uv" } },
      })
    ).toBe("uv")
  })

  it("classifies SCP DTF customizer lines as dtf", () => {
    expect(
      itemMethod({
        metadata: {
          customizerDesign: {
            artifacts: [{ side: "front" }],
            pricing: {
              server: {
                mode: "scp_dtf",
                print_side_keys: ["front"],
              },
            },
          },
        },
      })
    ).toBe("dtf")
  })

  it("classifies embroidery-only customizer lines as embroidery", () => {
    expect(
      inferDecorationMethodFromCustomizer({
        sideDecorationMethods: { front: "embroidery" },
        pricing: {
          server: {
            mode: "scp_dtf_mixed",
            embroidery_side_keys: ["front"],
            print_side_keys: [],
          },
        },
      })
    ).toBe("embroidery")
  })

  it("classifies mixed print+embroidery customizer as dtf when print sides exist", () => {
    expect(
      inferDecorationMethodFromCustomizer({
        sideDecorationMethods: { front: "embroidery", back: "print" },
        pricing: {
          server: {
            mode: "scp_dtf_mixed",
            embroidery_side_keys: ["front"],
            print_side_keys: ["back"],
          },
        },
      })
    ).toBe("dtf")
  })

  it("defaults decorated customizer without server block to dtf", () => {
    expect(
      itemMethod({
        metadata: {
          customizerDesign: {
            prints: [{ objectId: "a", side: "front", sizeId: "up_to_a6" }],
          },
        },
      })
    ).toBe("dtf")
  })

  it("reads screen and embroidery sides even when a print size is set", () => {
    expect(
      itemMethod({
        metadata: {
          customizerDesign: {
            sideDecorationMethods: { front: "screen", back: "screen" },
            scpPrintSizeId: "up_to_a3",
          },
        },
      })
    ).toBe("screen")
    expect(
      itemMethod({
        metadata: {
          customizerDesign: {
            sideDecorationMethods: { front: "embroidery" },
            scpPrintSizeId: "up_to_a6",
            prints: [{}],
            pricing: { server: { mode: "scp_dtf_mixed", embroidery_side_keys: ["front"], print_side_keys: [] } },
          },
        },
      })
    ).toBe("embroidery")
  })

  it("puts fee lines in their own bucket", () => {
    expect(itemMethod({ title: "Screen setup", metadata: {} })).toBe("service")
    expect(itemMethod({ title: "Freight to customer", variant_sku: "SERVICE-LINE", metadata: {} })).toBe("service")
    expect(itemMethod({ title: "Logo prepared", metadata: { artwork_fee: true } })).toBe("service")
  })

  it("says so when a quoted garment has no method recorded", () => {
    expect(
      itemMethod({
        title: "Oversize T — Customer-supplied, Black",
        variant_sku: "SERVICE-LINE",
        metadata: { quote_locked_price: true },
      })
    ).toBe("unrecorded")
    expect(itemMethod({ title: "Classic Tee", metadata: { quote_custom_line: true } })).toBe("unrecorded")
  })

  it("returns blank for plain garment lines", () => {
    expect(itemMethod({ metadata: {} })).toBe("blank")
  })
})
