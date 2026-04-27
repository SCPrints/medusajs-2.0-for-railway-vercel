import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { computeCartWeight } from "../lib/cart-weight"
import {
  SHIPPING_FLAT_RATE_MAX_GRAMS,
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
} from "../lib/constants"

type SyntheticItem = {
  quantity: number
  variant: { weight: number }
}

type SyntheticCart = {
  items: SyntheticItem[]
}

const buildCart = (
  itemCount: number,
  perItemGrams: number
): SyntheticCart => ({
  items: Array.from({ length: itemCount }, () => ({
    quantity: 1,
    variant: { weight: perItemGrams },
  })),
})

const tierFor = (totalWeightGrams: number) =>
  totalWeightGrams <= SHIPPING_FLAT_RATE_MAX_GRAMS ? "flat" : "live"

const printScenario = (
  label: string,
  cart: SyntheticCart,
  log: (line: string) => void
) => {
  const summary = computeCartWeight(cart, SHIPPING_PACKAGING_OVERHEAD_GRAMS)
  const tier = tierFor(summary.totalWeightGrams)
  log(
    `[${label}] items=${cart.items.length}, items_weight_g=${summary.itemsWeightGrams}, ` +
      `overhead_g=${summary.packagingOverheadGrams}, total_g=${summary.totalWeightGrams}, ` +
      `threshold_g=${SHIPPING_FLAT_RATE_MAX_GRAMS}, tier=${tier}`
  )
  return { summary, tier }
}

/**
 * `npx medusa exec ./src/scripts/test-shipping-tier.ts` — synthesises two
 * carts at ~2.5 kg and ~3.5 kg and prints the threshold tier the
 * `/store/cart-shipping-options` route would resolve. Used to sanity-check
 * the hybrid shipping logic without standing up a full storefront flow.
 */
export default async function testShippingTier({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const log = (line: string) => logger.info(line)

  log("Hybrid-shipping threshold smoke test")
  log(
    `Constants: SHIPPING_FLAT_RATE_MAX_GRAMS=${SHIPPING_FLAT_RATE_MAX_GRAMS}g, ` +
      `SHIPPING_PACKAGING_OVERHEAD_GRAMS=${SHIPPING_PACKAGING_OVERHEAD_GRAMS}g`
  )

  // ~2.5 kg payload (under threshold, expects "flat")
  const lightCart = buildCart(12, 195)
  const lightResult = printScenario("under_threshold", lightCart, log)

  // ~3.5 kg payload (over threshold, expects "live")
  const heavyCart = buildCart(18, 195)
  const heavyResult = printScenario("over_threshold", heavyCart, log)

  // Edge case: exactly threshold (still flat).
  const edgeGrams = SHIPPING_FLAT_RATE_MAX_GRAMS - SHIPPING_PACKAGING_OVERHEAD_GRAMS
  const edgeCart: SyntheticCart = {
    items: [{ quantity: 1, variant: { weight: edgeGrams } }],
  }
  const edgeResult = printScenario("at_threshold", edgeCart, log)

  if (lightResult.tier !== "flat") {
    logger.warn(
      `Expected light cart (~2.5kg) to resolve to "flat" but got "${lightResult.tier}".`
    )
  }
  if (heavyResult.tier !== "live") {
    logger.warn(
      `Expected heavy cart (~3.5kg) to resolve to "live" but got "${heavyResult.tier}".`
    )
  }
  if (edgeResult.tier !== "flat") {
    logger.warn(
      `Expected edge cart (== threshold) to resolve to "flat" but got "${edgeResult.tier}".`
    )
  }

  logger.info("Done.")
}
