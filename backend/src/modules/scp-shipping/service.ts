import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  FulfillmentOption,
  Logger,
} from "@medusajs/framework/types"
import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"

import { computeCartWeight } from "../../lib/cart-weight"
import {
  SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS,
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
} from "../../lib/constants"
import { computeShippingAmount } from "../../lib/shipping-rate"

type InjectedDependencies = {
  logger: Logger
}

/**
 * SC Prints in-house "calculated" shipping provider.
 *
 * Unlike ShipStation/AusPost it makes NO external API call — `calculatePrice`
 * is a pure function of the cart's total weight via the weight→price ladder in
 * `lib/shipping-rate.ts`. This is the single rate the storefront shows: one
 * "Standard Shipping (AU)" option whose price scales with order size, with the
 * default-garment-weight fallback covering the catalog's missing weights.
 *
 * Provider id (config `id: "scp"` + `static identifier`) → `scp_scp`.
 */
class ScpShippingProviderService extends AbstractFulfillmentProviderService {
  static identifier = "scp"

  protected logger_: Logger

  constructor({ logger }: InjectedDependencies) {
    super()
    this.logger_ = logger
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    // A single weight-based service. The label is admin-facing only — the
    // storefront shows the shipping option's `name` ("Standard Shipping (AU)").
    return [
      {
        id: "scp-standard",
        name: "Standard Shipping (weight-based)",
      } as unknown as FulfillmentOption,
    ]
  }

  async canCalculate(): Promise<boolean> {
    return true
  }

  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const items = ((context as { items?: unknown[] })?.items as unknown[]) ?? []

    let totalWeightGrams = SHIPPING_PACKAGING_OVERHEAD_GRAMS
    try {
      const summary = computeCartWeight(
        { items: items as any },
        SHIPPING_PACKAGING_OVERHEAD_GRAMS,
        SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS
      )
      totalWeightGrams = summary.totalWeightGrams
    } catch (err) {
      // Pure math should never throw, but if the context shape surprises us we
      // must NOT break checkout — fall back to the base band rather than 500.
      this.logger_.warn(
        `scp-shipping calculatePrice: weight computation failed, using base band — ${
          (err as Error).message
        }`
      )
    }

    return {
      calculated_amount: computeShippingAmount(totalWeightGrams),
      // Price is ex-GST; Medusa applies the AU region's GST on top, matching
      // the "ex GST" label the storefront shows next to the rate (same as the
      // previous flat options).
      is_calculated_price_tax_inclusive: false,
    }
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<any> {
    // No external shipment to pre-create (unlike ShipStation) — pass the data
    // straight through so the shipping method can be added to the cart.
    return { ...data }
  }

  async createFulfillment(): Promise<any> {
    // SC Prints fulfils in-house / via the per-supplier dropship widgets; the
    // shipping provider itself creates no carrier label. Mirrors the manual
    // provider's no-op so the order's fulfillment flow completes cleanly.
    return { data: {} }
  }

  async cancelFulfillment(): Promise<any> {
    return {}
  }
}

export default ScpShippingProviderService
