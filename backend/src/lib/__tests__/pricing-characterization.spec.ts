/**
 * Pricing characterization harness — Phase 1 of the pricing-integrity work.
 *
 * Locks the CURRENT behavior of the SCP pricing implementations against a
 * fixture of real production design shapes (extracted from prod order lines
 * 2026-08-21, sanitized to pricing-relevant fields only) plus synthetic edge
 * cases. The golden file is the acceptance bar for the canonical-pricing
 * refactor: any change to these numbers is a behavior change and must be
 * intentional, reviewed, and regenerated deliberately.
 *
 * Regenerate goldens (ONLY when a behavior change is intended):
 *   UPDATE_PRICING_GOLDEN=1 pnpm test -- --testPathPattern=pricing-characterization
 *
 * Two implementations are exercised directly:
 *   - computeScpLineDescriptor (cart-add path; garment resolution mocked to
 *     the stored garment_unit_major so runs are DB-free and deterministic)
 *   - recomputeScpCartPricingPure (cart-wide recompute path)
 * The scp-update-design route's inline math is intentionally not called here
 * (it isn't importable in isolation); it is being collapsed onto the same
 * canonical function as these two, at which point these vectors cover it.
 */
import fs from "fs"
import path from "path"

jest.mock("../scp-resolve-garment-unit-price", () => {
  const actual = jest.requireActual("../scp-resolve-garment-unit-price")
  return {
    ...actual,
    resolveGarmentUnitAmountMajor: jest.fn(async (params: { metadataGarmentMajor?: number }) => {
      // The harness threads the case's stored garment price through the mock
      // via a global — the real resolver hits the DB for region pricing.
      return (globalThis as any).__CHARACTERIZATION_GARMENT_MAJOR__ ?? 0
    }),
  }
})

import { computeScpLineDescriptor } from "../scp-line-descriptor"
import { recomputeScpCartPricingPure } from "../recompute-scp-cart-pricing"

const FIXTURES = path.join(__dirname, "fixtures")
const SHAPES_PATH = path.join(FIXTURES, "pricing-shapes.json")
const GOLDEN_PATH = path.join(FIXTURES, "pricing-golden.json")

type ShapeCase = {
  name: string
  source?: string
  quantity: number
  design: {
    version: number | null
    scpPrintSizeId: string | null
    prints: Array<{ side: string; sizeId?: string }> | null
    artifacts: Array<{ side: string; print_size_id?: string | null }> | null
    sideDecorationMethods: Record<string, string> | null
    sideEmbroideryConfigs: Record<
      string,
      { stitchCount?: number; includeDigitizingFee?: boolean }
    > | null
    sideScreenConfigs?: Record<string, { colours?: number; darkGarment?: boolean }> | null
    server: Record<string, unknown>
    printPlacement?: Record<string, unknown>
  }
  variant: {
    bulk_pricing: { tiers?: Array<Record<string, unknown>> } | null
    cost_price_ex_gst_minor: number | null
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Build the cart-line metadata shape both implementations read. */
function lineMetadataFor(c: ShapeCase): Record<string, unknown> {
  const customizerDesign: Record<string, unknown> = {
    version: c.design.version ?? undefined,
    scpPrintSizeId: c.design.scpPrintSizeId ?? undefined,
    pricing: { server: c.design.server },
  }
  if (c.design.prints) customizerDesign.prints = c.design.prints
  if (c.design.artifacts) customizerDesign.artifacts = c.design.artifacts
  if (c.design.sideDecorationMethods)
    customizerDesign.sideDecorationMethods = c.design.sideDecorationMethods
  if (c.design.sideEmbroideryConfigs)
    customizerDesign.sideEmbroideryConfigs = c.design.sideEmbroideryConfigs
  if (c.design.sideScreenConfigs)
    customizerDesign.sideScreenConfigs = c.design.sideScreenConfigs
  if ((c.design as { sideLayouts?: unknown }).sideLayouts)
    customizerDesign.sideLayouts = (c.design as { sideLayouts?: unknown }).sideLayouts
  const metadata: Record<string, unknown> = { customizerDesign }
  // Legacy pre-artifacts payloads carry printPlacement at metadata top level.
  if (c.design.printPlacement) metadata.printPlacement = c.design.printPlacement
  return metadata
}

function printSizeIdFor(c: ShapeCase): string {
  return (
    c.design.scpPrintSizeId ??
    (c.design.server.print_size_id as string | null) ??
    "up_to_a6"
  )
}

async function runDescriptor(c: ShapeCase) {
  const garment =
    typeof c.design.server.garment_unit_major === "number"
      ? (c.design.server.garment_unit_major as number)
      : 0
  ;(globalThis as any).__CHARACTERIZATION_GARMENT_MAJOR__ = garment
  const d = await computeScpLineDescriptor({
    variantId: "variant_test",
    quantity: c.quantity,
    metadata: lineMetadataFor(c),
    printSizeIdRaw: printSizeIdFor(c),
    cart: { id: "cart_test", currency_code: "aud" },
    query: {} as never,
    tier: null,
  })
  const stampedServer = ((d.metadata.customizerDesign as any)?.pricing?.server ?? {}) as Record<
    string,
    unknown
  >
  return {
    unitPriceMajor: round2(d.unitPriceMajor),
    // Per-method decoration totals (from the stamped server block) — the
    // storefront mirror spec compares its displayed components against these.
    printTotalMajor: round2(Number(stampedServer.print_total_major_per_garment ?? 0)),
    embroideryTotalMajor: round2(Number(stampedServer.embroidery_total_major_per_garment ?? 0)),
    screenTotalMajor: round2(Number(stampedServer.screen_total_major_per_garment ?? 0)),
    tierIndex: d.tierIndex,
    printSides: d.printSides,
    embroiderySides: d.embroiderySides,
    embroideryBreakdown: d.embroideryBreakdown.map((b) => ({
      side: b.side,
      stitchCount: b.stitchCount,
      unitPriceMajor: round2(b.unitPriceMajor),
      digitizingFeeMajor: b.digitizingFeeMajor,
      requiresQuote: b.requiresQuote,
    })),
    // Screen: harness has no DB, so the descriptor's product-metadata lookup
    // fails closed → heavyGarment=false here. The stored-flag path is
    // exercised through the recompute cases instead.
    screenSides: d.screenSides,
    screenBreakdown: d.screenBreakdown.map((b) => ({
      side: b.side,
      colours: b.colours,
      effectiveColours: b.effectiveColours,
      darkGarment: b.darkGarment,
      heavyGarment: b.heavyGarment,
      unitPriceMajor: round2(b.unitPriceMajor),
    })),
  }
}

function runRecompute(c: ShapeCase) {
  const { prices, excluded_line_ids } = recomputeScpCartPricingPure([
    {
      id: "line_test",
      quantity: c.quantity,
      unit_price: 999, // stale on purpose so the recompute always re-derives
      variant: {
        id: "variant_test",
        metadata: {
          ...(c.variant.bulk_pricing ? { bulk_pricing: c.variant.bulk_pricing } : {}),
          ...(c.variant.cost_price_ex_gst_minor
            ? { cost_price_ex_gst_minor: c.variant.cost_price_ex_gst_minor }
            : {}),
        },
      },
      metadata: lineMetadataFor(c),
    },
  ])
  return {
    price: prices.has("line_test") ? round2(prices.get("line_test") as number) : null,
    excluded: excluded_line_ids.includes("line_test"),
  }
}

describe("pricing characterization (golden vectors)", () => {
  const shapes = JSON.parse(fs.readFileSync(SHAPES_PATH, "utf8")) as {
    cases: ShapeCase[]
  }
  const updateMode = process.env.UPDATE_PRICING_GOLDEN === "1"
  const golden: Record<string, unknown> = updateMode
    ? {}
    : JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"))

  afterAll(() => {
    if (updateMode) {
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 1))
      // eslint-disable-next-line no-console
      console.log(`pricing-golden.json regenerated with ${Object.keys(golden).length} cases`)
    }
  })

  for (const c of shapes.cases) {
    it(c.name, async () => {
      const actual = {
        descriptor: await runDescriptor(c),
        recompute: runRecompute(c),
      }
      if (updateMode) {
        golden[c.name] = actual
        return
      }
      expect(golden[c.name]).toBeDefined()
      expect(actual).toEqual(golden[c.name])
    })
  }
})
