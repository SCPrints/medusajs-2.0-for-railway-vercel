import { resolveGarmentUnitAmountMajor } from "../scp-resolve-garment-unit-price"

/**
 * Regression guard for the "Method calculatePrices requires currency_code in
 * the pricing context" cart-add failure. The calculated_price fallback (taken
 * only by variants WITHOUT bulk_pricing metadata, e.g. RAMO) must pass the
 * pricing context wrapped in QueryContext and nested under `calculated_price`
 * inside the FIRST (query-config) arg — not as a flat object, and not as the
 * second (options) arg, both of which Medusa silently ignores.
 */
type GraphCall = { config: any; options: any }

function makeQuery(metadata: Record<string, unknown>, calcAmount: number) {
  const calls: GraphCall[] = []
  return {
    calls,
    graph: async (config: any, options?: any) => {
      calls.push({ config, options })
      const fields: string[] = config.fields || []
      const wantsCalc = fields.some((f) => String(f).startsWith("calculated_price"))
      if (wantsCalc) {
        return {
          data: [
            { id: "v1", calculated_price: { calculated_amount: calcAmount, currency_code: "aud" } },
          ],
        }
      }
      return { data: [{ id: "v1", metadata }] }
    },
  }
}

const cart = {
  id: "cart_1",
  currency_code: "aud",
  region_id: "reg_1",
  sales_channel_id: "sc_1",
}

describe("resolveGarmentUnitAmountMajor", () => {
  it("short-circuits on bulk_pricing metadata (no calculated_price query)", async () => {
    const q = makeQuery(
      {
        bulk_pricing: {
          tiers: [
            { min_quantity: 1, max_quantity: 9, amount: 30 },
            { min_quantity: 10, amount: 25 },
          ],
        },
      },
      99
    )
    const amount = await resolveGarmentUnitAmountMajor({
      query: q,
      variantId: "v1",
      quantity: 12,
      cart,
    })
    expect(amount).toBe(25)
    expect(q.calls.length).toBe(1) // only the metadata query ran
  })

  it("uses a QueryContext pricing context in the FIRST arg for the calculated_price fallback", async () => {
    const q = makeQuery({ garment_images: [] }, 23.8)
    const amount = await resolveGarmentUnitAmountMajor({
      query: q,
      variantId: "v1",
      quantity: 5,
      cart,
    })
    expect(amount).toBe(23.8)

    const calcCall = q.calls.find((c) =>
      (c.config.fields || []).some((f: string) => String(f).startsWith("calculated_price"))
    )
    expect(calcCall).toBeTruthy()
    // The fix: context is on the query-config object (first arg), nested under
    // `calculated_price`. The broken code put it on the second arg / flat.
    expect(calcCall!.config.context?.calculated_price).toBeDefined()
    expect(calcCall!.options).toBeUndefined()
  })

  it("throws a clear error (not the cryptic core one) when the cart has no currency", async () => {
    const q = makeQuery({ garment_images: [] }, 23.8)
    await expect(
      resolveGarmentUnitAmountMajor({
        query: q,
        variantId: "v1",
        quantity: 5,
        cart: { id: "c", currency_code: null, region_id: "reg_1" },
      })
    ).rejects.toThrow(/currency/i)
  })
})
