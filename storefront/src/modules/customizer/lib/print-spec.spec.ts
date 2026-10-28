import {
  canvasPxToApproxCm,
  maxArtworkPx,
  mockupViewportTransform,
  mockupVisibleRect,
  printSpecsToPricingSpecs,
  resolveMockupArtworkScale,
  resolveMockupReferenceSize,
  snapSizeForBoundingCm,
  SCP_PRINT_SIZE_REFERENCE_CM,
} from "./print-spec"
import type { PrintSpec } from "./types"

describe("canvasPxToApproxCm", () => {
  it("returns zero for a degenerate canvas", () => {
    expect(canvasPxToApproxCm(100, 100, 0, 100)).toEqual({ width: 0, height: 0 })
  })

  it("maps the full print area to the oversize reference (38×48)", () => {
    // canvas 1000×1000 → print area 680×720; mapping that area should land
    // at the oversize reference.
    const cm = canvasPxToApproxCm(680, 720, 1000, 1000)
    expect(cm.width).toBeCloseTo(SCP_PRINT_SIZE_REFERENCE_CM.oversize.width, 5)
    expect(cm.height).toBeCloseTo(SCP_PRINT_SIZE_REFERENCE_CM.oversize.height, 5)
  })

  it("maps half the print area to half the reference cm", () => {
    const cm = canvasPxToApproxCm(340, 360, 1000, 1000)
    expect(cm.width).toBeCloseTo(19, 1)
    expect(cm.height).toBeCloseTo(24, 1)
  })
})

describe("maxArtworkPx", () => {
  it("lets A3 artwork reach the true 29 cm width, not the 19 cm guide", () => {
    const cap = maxArtworkPx("up_to_a3", 1000, 1000)
    expect(canvasPxToApproxCm(cap.width, cap.height, 1000, 1000).width).toBeCloseTo(29, 5)
    expect(snapSizeForBoundingCm("back", { width: 24, height: 30 }, false)).toBe("up_to_a3")
  })

  it("turns A6 sideways for wide artwork (15 cm wordmark, not 10 cm)", () => {
    const cap = maxArtworkPx("up_to_a6", 1000, 1000, true)
    const cm = canvasPxToApproxCm(cap.width, cap.height, 1000, 1000)
    expect(cm.width).toBeCloseTo(15, 5)
    expect(cm.height).toBeCloseTo(10, 5)
    expect(snapSizeForBoundingCm("front", { width: 14, height: 4 }, false)).toBe("up_to_a6")
  })
})

describe("snapSizeForBoundingCm", () => {
  it("snaps tiny artwork to A6", () => {
    expect(snapSizeForBoundingCm("front", { width: 5, height: 8 }, { isLongSleeve: false })).toBe("up_to_a6")
  })

  it("snaps mid-sized artwork to A4", () => {
    expect(snapSizeForBoundingCm("front", { width: 12, height: 18 }, false)).toBe("up_to_a4")
  })

  it("snaps large artwork to A3", () => {
    expect(snapSizeForBoundingCm("front", { width: 25, height: 36 }, false)).toBe("up_to_a3")
  })

  it("snaps anything bigger than A3 to oversize", () => {
    expect(snapSizeForBoundingCm("front", { width: 30, height: 40 }, false)).toBe("oversize")
  })

  it("forces printed_tag to A6 regardless of bounding size", () => {
    expect(snapSizeForBoundingCm("printed_tag", { width: 30, height: 40 }, false)).toBe(
      "up_to_a6"
    )
  })

  it("limits short-sleeve sleeves to A6", () => {
    expect(snapSizeForBoundingCm("left_sleeve", { width: 18, height: 26 }, false)).toBe(
      "up_to_a6"
    )
  })

  it("allows long-sleeve sleeves to use up to A3", () => {
    expect(snapSizeForBoundingCm("left_sleeve", { width: 25, height: 36 }, true)).toBe(
      "up_to_a3"
    )
  })

  it("clamps hats to A6 on every side regardless of bounding size", () => {
    expect(
      snapSizeForBoundingCm(
        "front",
        { width: 30, height: 40 },
        { isLongSleeve: false, isHat: true }
      )
    ).toBe("up_to_a6")
    expect(
      snapSizeForBoundingCm(
        "back",
        { width: 25, height: 35 },
        { isLongSleeve: false, isHat: true }
      )
    ).toBe("up_to_a6")
  })
})

describe("printSpecsToPricingSpecs", () => {
  it("clamps printed_tag stale overrides to A6", () => {
    const specs: PrintSpec[] = [
      {
        objectId: "obj_1",
        side: "printed_tag",
        sizeId: "up_to_a3",
        manualSize: true,
        approxCm: { width: 5, height: 5 },
      },
    ]
    expect(printSpecsToPricingSpecs(specs)).toEqual([
      { side: "printed_tag", sizeId: "up_to_a6" },
    ])
  })

  it("preserves non-restricted sides as-is", () => {
    const specs: PrintSpec[] = [
      {
        objectId: "obj_1",
        side: "front",
        sizeId: "up_to_a4",
        manualSize: false,
        approxCm: { width: 12, height: 18 },
      },
    ]
    expect(printSpecsToPricingSpecs(specs)).toEqual([
      { side: "front", sizeId: "up_to_a4" },
    ])
  })
})

describe("mockupVisibleRect", () => {
  it("is the canvas at scale 1", () => {
    expect(mockupVisibleRect(600, 750, 1)).toEqual({ x: 0, y: 0, width: 600, height: 750 })
  })

  it("maps through the viewport transform onto the whole frame", () => {
    const [s, , , , tx, ty] = mockupViewportTransform(600, 750, 0.68)
    const r = mockupVisibleRect(600, 750, 0.68)
    expect(s * r.x + tx).toBeCloseTo(0)
    expect(s * r.y + ty).toBeCloseTo(0)
    expect(s * (r.x + r.width) + tx).toBeCloseTo(600)
    expect(s * (r.y + r.height) + ty).toBeCloseTo(750)
    // Lower part of the shirt is reachable: the rect extends well below the canvas.
    expect(r.y + r.height).toBeGreaterThan(1000)
  })
})

describe("resolveMockupArtworkScale", () => {
  it("reads metadata.mockup_scale as a number or the admin editor's string", () => {
    expect(resolveMockupArtworkScale({ mockup_scale: 0.62 }, "front")).toBe(0.62)
    expect(resolveMockupArtworkScale({ mockup_scale: "0.62" }, "back")).toBe(0.62)
  })

  it("defaults to 1 (today's behaviour) when unset or out of range", () => {
    expect(resolveMockupArtworkScale(undefined, "front")).toBe(1)
    expect(resolveMockupArtworkScale({ mockup_scale: "" }, "front")).toBe(1)
    expect(resolveMockupArtworkScale({ mockup_scale: 0.1 }, "front")).toBe(1)
    expect(resolveMockupArtworkScale({ mockup_scale: 1.6 }, "front")).toBe(1)
  })

  it("never scales sleeves or the tag (generic drawing / zoomed view)", () => {
    expect(resolveMockupArtworkScale({ mockup_scale: 0.62 }, "left_sleeve")).toBe(1)
    expect(resolveMockupArtworkScale({ mockup_scale: 0.62 }, "printed_tag")).toBe(1)
  })
})

describe("garment_fit (stamped from size charts)", () => {
  const fit = { garment_fit: { mockup_scale: 0.7, reference_size: "M" } }

  it("uses the stamped scale and reports the reference size", () => {
    expect(resolveMockupArtworkScale(fit, "front")).toBe(0.7)
    expect(resolveMockupReferenceSize(fit)).toBe("M")
  })

  it("a manual mockup_scale wins and hides the size caption", () => {
    const meta = { ...fit, mockup_scale: "0.62" }
    expect(resolveMockupArtworkScale(meta, "front")).toBe(0.62)
    expect(resolveMockupReferenceSize(meta)).toBeNull()
  })

  it("no caption when the photo couldn't be measured", () => {
    const meta = { garment_fit: { mockup_scale: null, reference_size: "M" } }
    expect(resolveMockupArtworkScale(meta, "front")).toBe(1)
    expect(resolveMockupReferenceSize(meta)).toBeNull()
  })
})
